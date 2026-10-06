export const categoryLabels: Record<string, string> = {
  computer_science: 'Computer Science',
  mathematics: 'Mathematics',
  physics: 'Physics',
  chemistry: 'Chemistry',
  biology: 'Biology',
  engineering: 'Engineering',
  business: 'Business',
  humanities: 'Humanities',
  social_sciences: 'Social Sciences',
  arts: 'Arts',
  other: 'Other',
};

export const categories = [{ value: 'all', label: 'All Categories' }].concat(
  Object.entries(categoryLabels).map(([value, label]) => ({ value, label })),
);

export function formatTime(seconds: number | null | undefined) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function getYouTubeId(url?: string | null) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&#?/]+)/);
  return match ? match[1] : null;
}

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function shortDate(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return shortDate(iso);
}
