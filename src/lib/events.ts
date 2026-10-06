import type { Achievement } from './types';

type Listener = (a: Achievement) => void;
const listeners = new Set<Listener>();

/** App-wide achievement celebrations — also fired when offline progress syncs later. */
export function emitAchievement(a: Achievement | null | undefined) {
  if (a) listeners.forEach((l) => l(a));
}

export function onAchievement(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
