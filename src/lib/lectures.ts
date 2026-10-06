import { supabase } from './supabase';
import type { Lecture } from './types';

const BASE =
  'id, title, type, source_url, order_index, duration_minutes, transcript_text, ai_generated_description, suggested_resources, topic_timestamps, attachments, section_name, allow_download';

/**
 * Loads a course's lectures including offline-download fields. `offline_video_url` only
 * exists after mobile_offline_sync.sql has run, so fall back gracefully without it.
 */
export async function fetchCourseLectures(courseId: string): Promise<Lecture[]> {
  const full = await supabase.from('lectures').select(`${BASE}, offline_video_url`).eq('course_id', courseId).order('order_index');
  if (!full.error) return (full.data || []) as Lecture[];
  if (full.error.code !== '42703') throw full.error;
  const basic = await supabase.from('lectures').select(BASE).eq('course_id', courseId).order('order_index');
  if (basic.error) throw basic.error;
  return (basic.data || []) as Lecture[];
}

/** Lecture segments created on the website store their start as `&t=123s` on the URL. */
export function startSecondsFromUrl(url?: string | null) {
  const m = url?.match(/[?&]t=(\d+)s?/);
  return m ? parseInt(m[1], 10) : 0;
}
