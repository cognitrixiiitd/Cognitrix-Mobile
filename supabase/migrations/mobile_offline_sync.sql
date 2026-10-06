-- ============================================================
-- Cognitrix Mobile — offline support
--
-- Run once in: Supabase Dashboard > SQL Editor (same project as the website).
--
-- ADDITIVE ONLY:
--   * lectures.offline_video_url — optional downloadable copy of a YouTube lecture
--     (uploaded by the professor on the website). Nullable; existing rows unaffected.
--   * complete_lecture / submit_quiz / add_watch_time — atomic, idempotent RPCs used
--     by the app to sync progress made offline.
--
-- Why RPCs: the website updates progress with read-modify-write from the browser
-- (read completed_lectures / total_points, change it, write it back). If a phone
-- syncs an hour-old offline change that way, it overwrites whatever happened on the
-- website in between. These functions append/increment inside the database instead,
-- and are safe to replay: completing a lecture twice or re-sending the same quiz
-- submission never double-counts.
--
-- All functions are SECURITY INVOKER, so the existing RLS policies still apply.
-- ============================================================

alter table public.lectures add column if not exists offline_video_url text;


-- ------------------------------------------------------------
-- Small helper: award points atomically and keep level in sync
-- (level formula identical to the website: floor(points / 1000) + 1).
-- Lives in a schema the REST API does not expose, so the app can't call it directly.
-- ------------------------------------------------------------
create schema if not exists cognitrix_private;
grant usage on schema cognitrix_private to authenticated;

create or replace function cognitrix_private.award_points(p_points int, p_extra jsonb default '{}')
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into student_stats (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  update student_stats
     set total_points       = coalesce(total_points, 0) + p_points,
         level              = floor((coalesce(total_points, 0) + p_points) / 1000.0) + 1,
         last_active_date   = current_date,
         quizzes_completed  = coalesce(quizzes_completed, 0)  + coalesce((p_extra->>'quizzes')::int, 0),
         perfect_quiz_count = coalesce(perfect_quiz_count, 0) + coalesce((p_extra->>'perfect')::int, 0),
         courses_completed  = coalesce(courses_completed, 0)  + coalesce((p_extra->>'courses')::int, 0)
   where user_id = auth.uid();
end;
$$;


-- ------------------------------------------------------------
-- complete_lecture: the single source of the progress rules (website + app)
--   +10 points the first time a lecture is completed
--   +100 points and a course achievement when the course hits 100%
-- ------------------------------------------------------------
create or replace function public.complete_lecture(
  p_course_id       uuid,
  p_lecture_id      uuid,
  p_watch_seconds   int         default 0,
  p_current_time    numeric     default null,
  p_video_duration  numeric     default null,
  p_completed_at    timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  e           enrollments%rowtype;
  done        text[];
  total       int;
  prog        int;
  was_done    boolean;
  n_courses   int;
  ach         jsonb := null;
begin
  select * into e from enrollments
   where course_id = p_course_id and student_id = auth.uid()
   for update;
  if not found then
    raise exception 'Not enrolled in this course' using errcode = 'P0002';
  end if;

  was_done := p_lecture_id::text = any(coalesce(e.completed_lectures, '{}'));
  done := case when was_done then coalesce(e.completed_lectures, '{}')
               else array_append(coalesce(e.completed_lectures, '{}'), p_lecture_id::text) end;

  select count(*) into total from lectures where course_id = p_course_id and status = 'active';
  prog := case when total > 0 then least(100, round(cardinality(done) * 100.0 / total)) else 0 end;

  update enrollments
     set completed_lectures = done,
         progress_percent   = prog,
         last_accessed      = greatest(coalesce(last_accessed, p_completed_at), p_completed_at),
         time_spent_minutes = coalesce(time_spent_minutes, 0) + round(coalesce(p_watch_seconds, 0) / 60.0),
         status             = case when prog = 100 then 'completed' else 'active' end,
         completed_at       = case when prog = 100 then coalesce(completed_at, p_completed_at) else null end
   where id = e.id;

  insert into analytics_events (user_id, course_id, lecture_id, event_type, timestamp_seconds, meta)
  values (auth.uid(), p_course_id, p_lecture_id, 'complete', p_current_time,
          jsonb_build_object('watch_duration_seconds', p_watch_seconds, 'video_duration_seconds', p_video_duration,
                             'platform', 'mobile', 'synced_at', now(), 'completed_at', p_completed_at));

  if not was_done then
    perform cognitrix_private.award_points(10);

    if prog = 100 then
      perform cognitrix_private.award_points(100, '{"courses": 1}');
      select courses_completed into n_courses from student_stats where user_id = auth.uid();
      insert into achievements (user_id, course_id, achievement_type, badge_name, badge_description, badge_icon, points_awarded)
      values (auth.uid(), p_course_id,
              case when n_courses = 1 then 'first_course' else 'course_completed' end,
              case when n_courses = 1 then 'First Course!' else 'Course Completed!' end,
              case when n_courses = 1 then 'Completed your first course' else 'Completed ' || n_courses || ' courses' end,
              'trophy', 100)
      returning to_jsonb(achievements.*) into ach;
    end if;
  end if;

  return jsonb_build_object('progress', prog, 'completed_lectures', done, 'already_completed', was_done, 'achievement', ach);
end;
$$;


-- ------------------------------------------------------------
-- submit_quiz: graded on the server; the single source of the quiz rules.
--   Points on the FIRST attempt only: 10 + 40 × score%, +10 bonus at 100%.
--   "Perfect Score!" badge (0 points) at 100% on the first attempt.
--   Retakes are recorded in the history but earn nothing.
-- p_answers is keyed by quiz_questions.id: { "<question id>": 2 | "text answer" }
-- p_client_id makes retries of the same submission idempotent.
-- ------------------------------------------------------------
create or replace function public.submit_quiz(
  p_quiz_id      uuid,
  p_answers      jsonb,
  p_client_id    uuid,
  p_submitted_at timestamptz default now()
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  qz        quizzes%rowtype;
  q         record;
  ans       jsonb;
  correct   int := 0;
  total     int := 0;
  pct       int;
  pts       int := 0;
  first     boolean;
  prev      jsonb;
  e_id      uuid;
  has_hist  boolean;
  ach       jsonb := null;
begin
  -- Idempotency: the same submission synced twice returns the first result.
  select meta into prev from analytics_events
   where user_id = auth.uid() and event_type = 'quiz_submit' and meta->>'client_id' = p_client_id::text
   limit 1;
  if prev is not null then
    return jsonb_build_object('score', (prev->>'score')::int, 'correct', (prev->>'correct')::int,
                              'total', (prev->>'total')::int, 'points', coalesce((prev->>'points')::int, 0),
                              'first_attempt', coalesce((prev->>'first_attempt')::boolean, false),
                              'duplicate', true, 'achievement', null);
  end if;

  select * into qz from quizzes where id = p_quiz_id;
  if not found then
    raise exception 'Quiz not found' using errcode = 'P0002';
  end if;

  for q in select id, question_type, correct_index, correct_answer from quiz_questions where quiz_id = p_quiz_id loop
    continue when q.question_type = 'short_answer';
    total := total + 1;
    ans := p_answers -> q.id::text;
    if q.question_type = 'fill_in_blank' then
      if ans is not null and lower(trim(ans #>> '{}')) = lower(trim(coalesce(q.correct_answer, ''))) then
        correct := correct + 1;
      end if;
    elsif ans is not null and jsonb_typeof(ans) = 'number' and (ans #>> '{}')::int = q.correct_index then
      correct := correct + 1;
    end if;
  end loop;

  if total = 0 then
    raise exception 'This quiz has no auto-graded questions' using errcode = 'P0001';
  end if;
  pct := round(correct * 100.0 / total);

  -- First attempt? Check the website's quiz history (enrollments.quiz_scores, if that
  -- column exists) and earlier submissions logged by either app.
  select id into e_id from enrollments where course_id = qz.course_id and student_id = auth.uid();
  has_hist := exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'enrollments' and column_name = 'quiz_scores'
  );
  first := not exists (
    select 1 from analytics_events
     where user_id = auth.uid() and event_type = 'quiz_submit' and meta->>'quiz_id' = p_quiz_id::text
  );
  if first and has_hist and e_id is not null then
    execute 'select not exists (select 1 from enrollments, jsonb_array_elements(coalesce(quiz_scores, ''[]''::jsonb)) x
                                 where id = $1 and x->>''quiz_id'' = $2)'
      into first using e_id, p_quiz_id::text;
  end if;

  -- Keep the website's quiz history in sync (used by QuizAnalysis.jsx).
  if has_hist and e_id is not null then
    execute 'update enrollments set quiz_scores = coalesce(quiz_scores, ''[]''::jsonb) || $1 where id = $2'
      using jsonb_build_array(jsonb_build_object('quiz_id', p_quiz_id, 'score', correct, 'max_score', total,
                                                 'submitted_at', p_submitted_at, 'client_id', p_client_id)),
            e_id;
  end if;

  if first then
    pts := 10 + round(40 * pct / 100.0) + case when pct = 100 then 10 else 0 end;
    perform cognitrix_private.award_points(pts,
      jsonb_build_object('quizzes', 1, 'perfect', case when pct = 100 then 1 else 0 end));

    if pct = 100 then
      insert into achievements (user_id, course_id, achievement_type, badge_name, badge_description, badge_icon, points_awarded)
      values (auth.uid(), qz.course_id, 'perfect_score', 'Perfect Score!', 'Got 100% on a quiz', 'award', 0)
      returning to_jsonb(achievements.*) into ach;
    end if;
  end if;

  insert into analytics_events (user_id, course_id, lecture_id, event_type, meta)
  values (auth.uid(), qz.course_id, qz.lecture_id, 'quiz_submit',
          jsonb_build_object('score', pct, 'correct', correct, 'total', total, 'quiz_id', p_quiz_id,
                             'points', pts, 'first_attempt', first, 'client_id', p_client_id,
                             'submitted_at', p_submitted_at));

  return jsonb_build_object('score', pct, 'correct', correct, 'total', total, 'points', pts,
                            'first_attempt', first, 'duplicate', false, 'achievement', ach);
end;
$$;


-- ------------------------------------------------------------
-- add_watch_time: atomic increment (the web version overwrites the total)
-- ------------------------------------------------------------
create or replace function public.add_watch_time(p_course_id uuid, p_minutes int, p_at timestamptz default now())
returns void
language sql
set search_path = public
as $$
  update enrollments
     set time_spent_minutes = coalesce(time_spent_minutes, 0) + greatest(p_minutes, 0),
         last_accessed      = greatest(coalesce(last_accessed, p_at), p_at)
   where course_id = p_course_id and student_id = auth.uid();
$$;


revoke execute on function cognitrix_private.award_points(int, jsonb) from public, anon;
grant execute on function cognitrix_private.award_points(int, jsonb) to authenticated;
grant execute on function public.complete_lecture(uuid, uuid, int, numeric, numeric, timestamptz) to authenticated;
grant execute on function public.submit_quiz(uuid, jsonb, uuid, timestamptz) to authenticated;
grant execute on function public.add_watch_time(uuid, int, timestamptz) to authenticated;

-- ------------------------------------------------------------
-- Realtime: lets an open website tab and the app refresh instantly when the
-- student's progress changes on the other device. Row Level Security still
-- applies, so each user only receives changes to rows they can read.
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['enrollments', 'student_stats', 'achievements', 'bookmarks'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- Make PostgREST pick up the new column and functions immediately.
notify pgrst, 'reload schema';
