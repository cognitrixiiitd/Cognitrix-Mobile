/**
 * Offline downloads for lecture videos, documents and attachments.
 *
 * Only lectures the professor marked "Allow offline download" on the website
 * (lectures.allow_download) can be saved. YouTube lectures are downloadable when the
 * professor uploaded an offline copy (lectures.offline_video_url) — the app never
 * downloads from YouTube itself.
 */
import { Directory, DownloadTask, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import type { Lecture } from './types';

export type DownloadKind = 'video' | 'document' | 'attachment';

export type DownloadEntry = {
  key: string;
  lectureId: string;
  courseId: string;
  courseTitle: string;
  lectureTitle: string;
  kind: DownloadKind;
  name: string;
  remoteUrl: string;
  fileUri: string;
  size: number;
  downloadedAt: string;
};

export type DownloadTarget = Omit<DownloadEntry, 'fileUri' | 'size' | 'downloadedAt'>;

type Progress = { progress: number; bytes: number; total: number; error?: string };

const INDEX_KEY = 'cognitrix-downloads';
const dir = new Directory(Paths.document, 'cognitrix-downloads');

let index: Record<string, DownloadEntry> = loadIndex();
const progress: Record<string, Progress> = {};
const tasks: Record<string, DownloadTask> = {};
const listeners = new Set<() => void>();
let version = 0;
let indexVersion = 0;

function loadIndex(): Record<string, DownloadEntry> {
  try {
    const parsed: Record<string, DownloadEntry> = JSON.parse(localStorage.getItem(INDEX_KEY) || '{}');
    // Drop entries whose files were removed (e.g. the OS cleared storage).
    return Object.fromEntries(Object.entries(parsed).filter(([, e]) => new File(e.fileUri).exists));
  } catch {
    return {};
  }
}

function emit(persist = false) {
  version++;
  if (persist) {
    indexVersion++;
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch {
      // ignore
    }
  }
  listeners.forEach((l) => l());
}

function useStore<T>(select: () => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    select,
  );
}

/* ───────────── what can be downloaded ───────────── */

const isFileUrl = (url?: string | null) => !!url && (/\/storage\/v1\/object\//.test(url) || /\.(pdf|pptx?|docx?|mp4|mov|m4v|webm|zip|txt|png|jpe?g)(\?|$)/i.test(url));

/** Every file of a lecture that may be saved for offline use. Empty when downloads aren't allowed. */
export function downloadTargets(lecture: Lecture, course: { id: string; title: string }): DownloadTarget[] {
  if (!lecture.allow_download) return [];
  const base = { lectureId: lecture.id, courseId: course.id, courseTitle: course.title, lectureTitle: lecture.title };
  const out: DownloadTarget[] = [];
  const videoUrl = lecture.type === 'video' ? lecture.source_url : lecture.type === 'youtube' ? lecture.offline_video_url : null;
  if (videoUrl) out.push({ ...base, key: `${lecture.id}:video`, kind: 'video', name: lecture.title, remoteUrl: videoUrl });
  if ((lecture.type === 'pdf' || lecture.type === 'slides' || lecture.type === 'notes') && isFileUrl(lecture.source_url)) {
    out.push({ ...base, key: `${lecture.id}:document`, kind: 'document', name: lecture.title, remoteUrl: lecture.source_url! });
  }
  (lecture.attachments || []).forEach((a, i) => {
    if (isFileUrl(a.url)) out.push({ ...base, key: `${lecture.id}:att:${i}`, kind: 'attachment', name: a.name || `Attachment ${i + 1}`, remoteUrl: a.url });
  });
  return out;
}

/* ───────────── queries ───────────── */

export function getDownload(key: string): DownloadEntry | undefined {
  return index[key];
}

/** Local file for the lecture's main video, if downloaded. */
export function localVideoUri(lectureId: string) {
  return index[`${lectureId}:video`]?.fileUri ?? null;
}

/** Re-renders only when a download finishes or is removed (not on progress ticks). */
export function useDownloadIndex() {
  return useStore(() => indexVersion);
}

export function useDownloads() {
  useStore(() => version);
  return Object.values(index).sort((a, b) => a.courseTitle.localeCompare(b.courseTitle) || a.lectureTitle.localeCompare(b.lectureTitle));
}

export function useDownloadState(keys: string[]) {
  useStore(() => version);
  const done = keys.filter((k) => index[k]).length;
  const active = keys.filter((k) => progress[k] && !progress[k].error);
  const failed = keys.filter((k) => progress[k]?.error);
  const bytes = active.reduce((s, k) => s + progress[k].bytes, 0);
  const total = active.reduce((s, k) => s + progress[k].total, 0);
  return {
    done,
    total: keys.length,
    complete: keys.length > 0 && done === keys.length,
    downloading: active.length > 0,
    progress: total > 0 ? bytes / total : 0,
    error: failed.length ? progress[failed[0]].error : undefined,
  };
}

export function formatBytes(n: number) {
  if (!n) return '0 MB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function freeSpace() {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return null;
  }
}

/* ───────────── actions ───────────── */

function extension(url: string) {
  const m = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : 'bin';
}

export async function download(target: DownloadTarget) {
  if (index[target.key] || tasks[target.key]) return;
  dir.create({ idempotent: true, intermediates: true });
  const safeKey = target.key.replace(/[^a-z0-9-]/gi, '_');
  const file = new File(dir, `${safeKey}.${extension(target.remoteUrl)}`);
  if (file.exists) file.delete();

  progress[target.key] = { progress: 0, bytes: 0, total: 0 };
  emit();

  const task = new DownloadTask(target.remoteUrl, file, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      progress[target.key] = { progress: totalBytes > 0 ? bytesWritten / totalBytes : 0, bytes: bytesWritten, total: totalBytes };
      emit();
    },
  });
  tasks[target.key] = task;

  try {
    const result = await task.downloadAsync();
    if (!result) throw new Error('Download cancelled');
    index[target.key] = { ...target, fileUri: result.uri, size: result.size ?? 0, downloadedAt: new Date().toISOString() };
    delete progress[target.key];
    emit(true);
  } catch (err: any) {
    const cancelled = /cancel|abort/i.test(String(err?.message));
    if (cancelled) delete progress[target.key];
    else progress[target.key] = { progress: 0, bytes: 0, total: 0, error: err?.message || 'Download failed' };
    try {
      if (file.exists) file.delete();
    } catch {
      // ignore
    }
    emit();
  } finally {
    delete tasks[target.key];
  }
}

/** Downloads several files one after another (avoids saturating a phone connection). */
export async function downloadAll(targets: DownloadTarget[]) {
  for (const t of targets) await download(t);
}

export function cancel(keys: string[]) {
  keys.forEach((k) => tasks[k]?.cancel());
}

export function remove(keys: string[]) {
  keys.forEach((k) => {
    const e = index[k];
    if (e) {
      try {
        const f = new File(e.fileUri);
        if (f.exists) f.delete();
      } catch {
        // ignore
      }
      delete index[k];
    }
    delete progress[k];
  });
  emit(true);
}

export function removeAll() {
  try {
    if (dir.exists) dir.delete();
  } catch {
    // ignore
  }
  index = {};
  emit(true);
}

export function mimeFor(uri: string) {
  const ext = extension(uri);
  return (
    {
      pdf: 'application/pdf',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      txt: 'text/plain',
    } as Record<string, string>
  )[ext] ?? '*/*';
}
