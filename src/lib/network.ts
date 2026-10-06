import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

// Drive TanStack Query's online state from the real network, so queries pause
// (and serve the saved cache) instead of failing when the phone is offline.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    // isInternetReachable is null while unknown — only treat an explicit `false` as offline.
    setOnline(state.isConnected !== false && state.isInternetReachable !== false);
  }),
);

export function isOnline() {
  return onlineManager.isOnline();
}

export function useIsOnline() {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  );
}

/** True when a Supabase/fetch error was caused by connectivity rather than by the server. */
export function isNetworkError(err: unknown) {
  if (!onlineManager.isOnline()) return true;
  const msg = String((err as any)?.message ?? err ?? '');
  return /network request failed|failed to fetch|fetch failed|network error|timed? ?out|aborted|ECONN|ENOTFOUND/i.test(msg);
}

export const OFFLINE_MESSAGE = "You're offline. This needs an internet connection — try again when you're back online.";
