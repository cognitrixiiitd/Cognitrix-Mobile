import 'expo-sqlite/localStorage/install';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import './network';

const WEEK = 1000 * 60 * 60 * 24 * 7;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Keep data long enough to survive a week offline (must be >= the persister's maxAge).
      gcTime: WEEK,
      retry: 1,
      refetchOnWindowFocus: true,
      // Serve cached data immediately and only hit the network when it's available.
      networkMode: 'offlineFirst',
    },
  },
});

/**
 * Saves the query cache to on-device SQLite storage (expo-sqlite's localStorage),
 * so every screen a student has opened before still renders with no connection —
 * even after the app is closed and reopened.
 */
export const persister = createSyncStoragePersister({
  storage: localStorage,
  key: 'cognitrix-query-cache',
  throttleTime: 2000,
});

export const persistOptions = {
  persister,
  maxAge: WEEK,
  buster: 'v1',
  dehydrateOptions: {
    // Only persist successful data; skip the AI tutor lookups and transient keys.
    shouldDehydrateQuery: (q: { state: { status: string }; queryKey: readonly unknown[] }) =>
      q.state.status === 'success' && q.queryKey[0] !== 'tutor-lecture',
  },
};

// Refetch when the app returns to the foreground, so changes made on the
// website show up when the student switches back to the phone.
AppState.addEventListener('change', (status) => {
  if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
});
