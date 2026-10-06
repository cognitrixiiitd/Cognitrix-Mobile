/**
 * Offline outbox.
 *
 * Every write a student makes goes through `run()`. Online, it executes immediately.
 * Offline (or if the request fails for network reasons), it's saved to on-device
 * storage and replayed in order once the phone reconnects — including after the app
 * was closed. Progress/quiz writes use the idempotent RPCs from
 * supabase/migrations/mobile_offline_sync.sql, so a replay can never double-count or
 * overwrite progress made on the website in the meantime.
 */
import { useSyncExternalStore } from 'react';

import { emitAchievement } from './events';
import { today } from './format';
import { isNetworkError, isOnline } from './network';
import { queryClient } from './query';
import { supabase } from './supabase';
import type { Achievement } from './types';

export type Action =
  | { type: 'complete_lecture'; courseId: string; lectureId: string; watchSeconds: number; currentTime: number; videoDuration: number; at: string }
  | { type: 'submit_quiz'; quizId: string; answers: Record<string, number | string>; clientId: string; at: string }
  | { type: 'add_watch_time'; courseId: string; minutes: number; at: string }
  | { type: 'insert_bookmark'; row: { id: string; user_id: string; course_id: string; lecture_id: string; timestamp_seconds: number; note: string | null } }
  | { type: 'delete_bookmark'; id: string }
  | { type: 'ask_question'; row: Record<string, unknown> & { id: string } }
  | { type: 'log_event'; row: Record<string, unknown> };

type Item = { id: string; userId: string; action: Action; createdAt: string; attempts: number; lastError?: string };

export type ActionResult = { achievement?: Achievement | null; score?: number; correct?: number; total?: number; points?: number } | void;

const KEY = 'cognitrix-outbox';
const FAILED_KEY = 'cognitrix-outbox-failed';
const MAX_ATTEMPTS = 5;

/* ───────────── storage + subscription ───────────── */

let items: Item[] = load();
const listeners = new Set<() => void>();

function load(): Item[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function save(next: Item[]) {
  items = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full — keep in memory
  }
  listeners.forEach((l) => l());
}

export function pendingCount(userId?: string) {
  return userId ? items.filter((i) => i.userId === userId).length : items.length;
}

export function usePendingCount(userId?: string) {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pendingCount(userId),
  );
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ───────────── public API ───────────── */

/** Execute now if possible, otherwise queue. Returns `queued: true` when deferred. */
export async function run(userId: string, action: Action): Promise<{ queued: boolean; result?: ActionResult }> {
  // Keep ordering: if older actions are still waiting, this one waits behind them.
  if (!isOnline() || pendingCount(userId) > 0) {
    enqueue(userId, action);
    if (isOnline()) flush(userId);
    return { queued: true };
  }
  try {
    const result = await execute(action);
    return { queued: false, result };
  } catch (err) {
    if (isNetworkError(err)) {
      enqueue(userId, action);
      return { queued: true };
    }
    throw err;
  }
}

function enqueue(userId: string, action: Action) {
  save([...items, { id: newId(), userId, action, createdAt: new Date().toISOString(), attempts: 0 }]);
}

let flushing: Promise<void> | null = null;

/** Replays queued actions for this user, oldest first. Safe to call often. */
export function flush(userId: string): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    let synced = 0;
    try {
      while (isOnline()) {
        const item = items.find((i) => i.userId === userId);
        if (!item) break;
        try {
          const result = await execute(item.action);
          save(items.filter((i) => i.id !== item.id));
          synced++;
          if (result && 'achievement' in result) emitAchievement(result.achievement);
        } catch (err) {
          if (isNetworkError(err)) break; // try again on the next reconnect
          const attempts = item.attempts + 1;
          const message = String((err as any)?.message ?? err);
          if (attempts >= MAX_ATTEMPTS) {
            console.warn('[sync] dropping action after repeated failures', item.action.type, message);
            recordFailure({ ...item, attempts, lastError: message });
            save(items.filter((i) => i.id !== item.id));
          } else {
            save(items.map((i) => (i.id === item.id ? { ...i, attempts, lastError: message } : i)));
            break;
          }
        }
      }
    } finally {
      flushing = null;
      if (synced > 0) queryClient.invalidateQueries();
    }
  })();
  return flushing;
}

function recordFailure(item: Item) {
  try {
    const prev = JSON.parse(localStorage.getItem(FAILED_KEY) || '[]');
    localStorage.setItem(FAILED_KEY, JSON.stringify([...prev, item].slice(-50)));
  } catch {
    // ignore
  }
}

/** Removes another account's leftovers on sign-out (their changes can't be sent by someone else). */
export function clearOutbox(userId: string) {
  save(items.filter((i) => i.userId !== userId));
}

/* ───────────── executors ───────────── */

// PostgREST "function not found" — the offline migration hasn't been run yet.
const missingRpc = (e: any) => e?.code === 'PGRST202' || e?.code === '42883';

async function execute(action: Action): Promise<ActionResult> {
  switch (action.type) {
    case 'complete_lecture': {
      const { data, error } = await supabase.rpc('complete_lecture', {
        p_course_id: action.courseId,
        p_lecture_id: action.lectureId,
        p_watch_seconds: Math.round(action.watchSeconds),
        p_current_time: action.currentTime,
        p_video_duration: action.videoDuration,
        p_completed_at: action.at,
      });
      if (error && missingRpc(error)) return legacyCompleteLecture(action);
      if (error) throw error;
      return { achievement: (data as any)?.achievement ?? null };
    }
    case 'submit_quiz': {
      const { data, error } = await supabase.rpc('submit_quiz', {
        p_quiz_id: action.quizId,
        p_answers: action.answers,
        p_client_id: action.clientId,
        p_submitted_at: action.at,
      });
      if (error && missingRpc(error)) return legacySubmitQuiz(action);
      if (error) throw error;
      const d = data as any;
      return { score: d?.score, correct: d?.correct, total: d?.total, points: d?.points, achievement: d?.achievement ?? null };
    }
    case 'add_watch_time': {
      const { error } = await supabase.rpc('add_watch_time', { p_course_id: action.courseId, p_minutes: action.minutes, p_at: action.at });
      if (error && missingRpc(error)) return legacyAddWatchTime(action);
      if (error) throw error;
      return;
    }
    case 'insert_bookmark': {
      // Client-generated id makes this idempotent on replay.
      const { error } = await supabase.from('bookmarks').upsert(action.row, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      return;
    }
    case 'delete_bookmark': {
      const { error } = await supabase.from('bookmarks').delete().eq('id', action.id);
      if (error) throw error;
      return;
    }
    case 'ask_question': {
      const { error } = await supabase.from('questions').upsert(action.row, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      return;
    }
    case 'log_event': {
      const { error } = await supabase.from('analytics_events').insert(action.row);
      if (error) throw error;
      return;
    }
  }
}

/* ───────────── legacy fallbacks (same writes as the website) ───────────── */

async function legacyAward(userId: string, points: number, extra: { quizzes?: number; perfect?: number; courses?: number } = {}) {
  const { data: s } = await supabase.from('student_stats').select('*').eq('user_id', userId).maybeSingle();
  if (!s) return null;
  const total = (s.total_points || 0) + points;
  const { data } = await supabase
    .from('student_stats')
    .update({
      total_points: total,
      level: Math.floor(total / 1000) + 1,
      last_active_date: today(),
      quizzes_completed: (s.quizzes_completed || 0) + (extra.quizzes || 0),
      perfect_quiz_count: (s.perfect_quiz_count || 0) + (extra.perfect || 0),
      courses_completed: (s.courses_completed || 0) + (extra.courses || 0),
    })
    .eq('id', s.id)
    .select()
    .single();
  return data;
}

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Not signed in');
  return id;
}

async function legacyCompleteLecture(a: Extract<Action, { type: 'complete_lecture' }>): Promise<ActionResult> {
  const userId = await currentUserId();
  const { data: e, error } = await supabase.from('enrollments').select('*').eq('course_id', a.courseId).eq('student_id', userId).single();
  if (error) throw error;
  const { count } = await supabase.from('lectures').select('id', { count: 'exact', head: true }).eq('course_id', a.courseId);
  const completed: string[] = [...(e.completed_lectures || [])];
  const was = completed.includes(a.lectureId);
  if (!was) completed.push(a.lectureId);
  const progress = count ? Math.min(100, Math.round((completed.length / count) * 100)) : 0;
  const { error: upErr } = await supabase
    .from('enrollments')
    .update({
      completed_lectures: completed,
      progress_percent: progress,
      last_accessed: a.at,
      time_spent_minutes: (e.time_spent_minutes || 0) + Math.round(a.watchSeconds / 60),
      status: progress === 100 ? 'completed' : 'active',
      completed_at: progress === 100 ? a.at : null,
    })
    .eq('id', e.id);
  if (upErr) throw upErr;
  await supabase.from('analytics_events').insert({
    user_id: userId,
    course_id: a.courseId,
    lecture_id: a.lectureId,
    event_type: 'complete',
    timestamp_seconds: a.currentTime,
    meta: { watch_duration_seconds: a.watchSeconds, video_duration_seconds: a.videoDuration, platform: 'mobile' },
  });
  if (was) return { achievement: null };
  await legacyAward(userId, 10);
  if (progress !== 100) return { achievement: null };
  const s = await legacyAward(userId, 100, { courses: 1 });
  const n = s?.courses_completed ?? 1;
  const { data: ach } = await supabase
    .from('achievements')
    .insert({
      user_id: userId,
      course_id: a.courseId,
      achievement_type: n === 1 ? 'first_course' : 'course_completed',
      badge_name: n === 1 ? 'First Course!' : 'Course Completed!',
      badge_description: n === 1 ? 'Completed your first course' : `Completed ${n} courses`,
      badge_icon: 'trophy',
      points_awarded: 100,
    })
    .select()
    .single();
  return { achievement: ach as Achievement };
}

async function legacySubmitQuiz(a: Extract<Action, { type: 'submit_quiz' }>): Promise<ActionResult> {
  const userId = await currentUserId();
  const { data: quiz, error } = await supabase.from('quizzes').select('id, course_id, lecture_id, quiz_questions(*)').eq('id', a.quizId).single();
  if (error) throw error;
  const gradable = (quiz.quiz_questions || []).filter((q: any) => q.question_type !== 'short_answer');
  if (gradable.length === 0) return { score: 0, correct: 0, total: 0, points: 0, achievement: null };
  let correct = 0;
  for (const q of gradable) {
    const ans = a.answers[q.id];
    if (q.question_type === 'fill_in_blank') {
      if (String(ans ?? '').trim().toLowerCase() === (q.correct_answer || '').trim().toLowerCase()) correct++;
    } else if (ans === q.correct_index) correct++;
  }
  const score = Math.round((correct / gradable.length) * 100);

  // Points only on the first attempt (same rule as the website).
  const { data: e } = await supabase.from('enrollments').select('id, quiz_scores').eq('course_id', quiz.course_id).eq('student_id', userId).maybeSingle();
  const history: any[] = (e as any)?.quiz_scores || [];
  const firstAttempt = !history.some((qs) => qs.quiz_id === quiz.id);
  if (e) {
    await supabase.from('enrollments').update({ quiz_scores: [...history, { quiz_id: quiz.id, score: correct, max_score: gradable.length, submitted_at: a.at }] }).eq('id', e.id);
  }
  await supabase.from('analytics_events').insert({
    user_id: userId,
    course_id: quiz.course_id,
    lecture_id: quiz.lecture_id,
    event_type: 'quiz_submit',
    meta: { score, correct, total: gradable.length, quiz_id: quiz.id, client_id: a.clientId, platform: 'mobile' },
  });
  if (!firstAttempt) return { score, correct, total: gradable.length, points: 0, achievement: null };

  const points = 10 + Math.round(40 * (score / 100)) + (score === 100 ? 10 : 0);
  await legacyAward(userId, points, { quizzes: 1, perfect: score === 100 ? 1 : 0 });

  let achievement: Achievement | null = null;
  if (score === 100) {
    const { data } = await supabase
      .from('achievements')
      .insert({
        user_id: userId,
        course_id: quiz.course_id,
        achievement_type: 'perfect_score',
        badge_name: 'Perfect Score!',
        badge_description: 'Got 100% on a quiz',
        badge_icon: 'award',
        points_awarded: 0,
      })
      .select()
      .single();
    achievement = data as Achievement;
  }
  return { score, correct, total: gradable.length, points, achievement };
}

async function legacyAddWatchTime(a: Extract<Action, { type: 'add_watch_time' }>): Promise<ActionResult> {
  const userId = await currentUserId();
  const { data: e } = await supabase.from('enrollments').select('id, time_spent_minutes').eq('course_id', a.courseId).eq('student_id', userId).maybeSingle();
  if (!e) return;
  await supabase
    .from('enrollments')
    .update({ time_spent_minutes: (e.time_spent_minutes || 0) + a.minutes, last_accessed: a.at })
    .eq('id', e.id);
}
