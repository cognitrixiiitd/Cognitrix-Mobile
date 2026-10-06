/**
 * Student progress, quizzes, bookmarks, notes and questions.
 *
 * Each function first updates the local (persisted) query cache so the UI reflects the
 * change instantly — online or offline — then hands the write to the outbox in sync.ts,
 * which sends it now or when the phone reconnects. Scoring rules match the website
 * (cognitrix/src/pages/CoursePlayer.jsx, components/player/QuizModule.jsx).
 */
import { randomUUID } from 'expo-crypto';

import { queryClient } from './query';
import { supabase } from './supabase';
import { run } from './sync';
import type { Achievement, Enrollment, Quiz } from './types';

/* ───────────── analytics ───────────── */

type EventType = 'play' | 'pause' | 'complete' | 'quiz_submit' | 'flag_stuck' | 'enroll' | 'question_asked' | 'bookmark';

export function logEvent(e: {
  user_id: string;
  event_type: EventType;
  course_id?: string | null;
  lecture_id?: string | null;
  timestamp_seconds?: number | null;
  meta?: Record<string, unknown>;
}) {
  run(e.user_id, {
    type: 'log_event',
    row: { ...e, meta: { ...(e.meta || {}), platform: 'mobile', client_time: new Date().toISOString() } },
  }).catch((err) => console.warn('[analytics]', err?.message));
}

/** Best-effort: the website creates the stats row lazily too. Skipped silently offline. */
export async function ensureStudentStats(userId: string) {
  try {
    const { data } = await supabase.from('student_stats').select('id').eq('user_id', userId).maybeSingle();
    if (!data) await supabase.from('student_stats').insert({ user_id: userId, total_points: 0, level: 1 });
  } catch {
    // offline
  }
}

/* ───────────── lecture completion ───────────── */

function patchEnrollment(courseId: string, patch: (e: Enrollment) => Enrollment) {
  const apply = (old: any) => {
    if (!old) return old;
    if (Array.isArray(old)) return old.map((e: Enrollment) => (e.course_id === courseId ? patch(e) : e));
    return old.course_id === courseId ? patch(old) : old;
  };
  queryClient.setQueriesData({ queryKey: ['player-enrollment', courseId] }, apply);
  queryClient.setQueriesData({ queryKey: ['student-enrollments'] }, apply);
  queryClient.setQueriesData({ queryKey: ['my-enrollments'] }, apply);
  queryClient.setQueriesData({ queryKey: ['enrollment', courseId] }, apply);
}

export async function completeLecture(args: {
  userId: string;
  courseId: string;
  lectureId: string;
  totalLectures: number;
  watchSeconds: number;
  currentTime: number;
  videoDuration: number;
}): Promise<{ queued: boolean; achievement: Achievement | null }> {
  const { userId, courseId, lectureId, totalLectures } = args;

  patchEnrollment(courseId, (e) => {
    const done = [...new Set([...(e.completed_lectures || []), lectureId])];
    const progress = totalLectures ? Math.min(100, Math.round((done.length / totalLectures) * 100)) : 0;
    return {
      ...e,
      completed_lectures: done,
      progress_percent: progress,
      status: progress === 100 ? 'completed' : 'active',
      time_spent_minutes: (e.time_spent_minutes || 0) + Math.round(args.watchSeconds / 60),
    };
  });

  const res = await run(userId, {
    type: 'complete_lecture',
    courseId,
    lectureId,
    watchSeconds: args.watchSeconds,
    currentTime: args.currentTime,
    videoDuration: args.videoDuration,
    at: new Date().toISOString(),
  });
  if (!res.queued) {
    queryClient.invalidateQueries({ queryKey: ['student-stats'] });
    queryClient.invalidateQueries({ queryKey: ['student-achievements'] });
    queryClient.invalidateQueries({ queryKey: ['player-enrollment', courseId] });
  }
  return { queued: res.queued, achievement: (res.result as any)?.achievement ?? null };
}

export async function addWatchTime(userId: string, courseId: string, minutes: number) {
  if (minutes < 1) return;
  patchEnrollment(courseId, (e) => ({ ...e, time_spent_minutes: (e.time_spent_minutes || 0) + minutes }));
  await run(userId, { type: 'add_watch_time', courseId, minutes, at: new Date().toISOString() }).catch(() => {});
}

/* ───────────── quizzes ───────────── */

export type QuizAnswers = Record<number, number | string>;

export function isAnswerCorrect(q: Quiz['questions'][number], answer: number | string | undefined) {
  if (q.question_type === 'fill_in_blank') {
    return String(answer ?? '').trim().toLowerCase() === (q.correct_answer || '').trim().toLowerCase();
  }
  return answer === q.correct_index;
}

/** Grades locally for instant feedback (works offline); the server re-grades authoritatively on sync. */
export async function submitQuiz(args: { quiz: Quiz; answers: QuizAnswers; userId: string }): Promise<{ score: number; points: number | null; queued: boolean; achievement: Achievement | null }> {
  const { quiz, answers, userId } = args;
  const gradable = quiz.questions.filter((q) => q.question_type !== 'short_answer');
  const correct = gradable.filter((q) => isAnswerCorrect(q, answers[quiz.questions.indexOf(q)])).length;
  const localScore = gradable.length ? Math.round((correct / gradable.length) * 100) : 0;

  const byId: Record<string, number | string> = {};
  quiz.questions.forEach((q, i) => {
    if (answers[i] !== undefined) byId[q.id] = answers[i];
  });

  const res = await run(userId, { type: 'submit_quiz', quizId: quiz.id, answers: byId, clientId: randomUUID(), at: new Date().toISOString() });
  const r = res.result as any;
  if (!res.queued) {
    queryClient.invalidateQueries({ queryKey: ['student-stats'] });
    queryClient.invalidateQueries({ queryKey: ['student-achievements'] });
    queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
  }
  // points: null while queued offline (the server decides: retakes earn 0).
  return { score: r?.score ?? localScore, points: r?.points ?? null, queued: res.queued, achievement: r?.achievement ?? null };
}

/* ───────────── bookmarks & notes (notes are bookmarks with text, as on the website) ───────────── */

export async function addBookmark(args: { userId: string; courseId: string; lectureId: string; timestampSeconds: number; note: string | null; lectureTitle?: string; courseTitle?: string }) {
  const row = {
    id: randomUUID(),
    user_id: args.userId,
    course_id: args.courseId,
    lecture_id: args.lectureId,
    timestamp_seconds: Math.round(args.timestampSeconds),
    note: args.note?.trim() ? args.note.trim() : null,
  };
  const listRow = { ...row, created_at: new Date().toISOString(), lectures: { title: args.lectureTitle }, courses: { title: args.courseTitle } };
  queryClient.setQueryData(['my-bookmarks', args.userId], (old: any[] | undefined) => [listRow, ...(old || [])]);
  if (row.note) {
    queryClient.setQueryData(['lecture-notes', args.lectureId, args.userId], (old: any[] | undefined) =>
      [...(old || []), row].sort((a, b) => (a.timestamp_seconds || 0) - (b.timestamp_seconds || 0)),
    );
  }
  await run(args.userId, { type: 'insert_bookmark', row });
  logEvent({ user_id: args.userId, course_id: args.courseId, lecture_id: args.lectureId, event_type: 'bookmark', timestamp_seconds: row.timestamp_seconds });
}

export async function deleteBookmark(userId: string, id: string) {
  const drop = (old: any[] | undefined) => (old || []).filter((b) => b.id !== id);
  queryClient.setQueryData(['my-bookmarks', userId], drop);
  queryClient.setQueriesData({ queryKey: ['lecture-notes'] }, drop);
  await run(userId, { type: 'delete_bookmark', id });
}

/* ───────────── questions ───────────── */

export async function askQuestion(args: { userId: string; userName: string; courseId: string; lectureId: string; text: string; courseTitle?: string }) {
  const row = {
    id: randomUUID(),
    user_id: args.userId,
    user_name: args.userName,
    course_id: args.courseId,
    lecture_id: args.lectureId,
    text: args.text,
    status: 'open',
    is_stuck_flag: false,
    is_private: false,
  };
  const now = new Date().toISOString();
  queryClient.setQueryData(['lecture-questions', args.lectureId], (old: any[] | undefined) => [{ ...row, created_at: now, answers: [], pending: true }, ...(old || [])]);
  queryClient.setQueryData(['student-questions', args.userId], (old: any[] | undefined) =>
    old ? [{ ...row, created_at: now, answers: [], courses: { title: args.courseTitle }, pending: true }, ...old] : old,
  );
  const res = await run(args.userId, { type: 'ask_question', row });
  logEvent({ user_id: args.userId, course_id: args.courseId, lecture_id: args.lectureId, event_type: 'question_asked' });
  return res;
}
