import { onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Notifications from 'expo-notifications';
import { DefaultTheme, router, Stack, ThemeProvider, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AchievementToast } from '@/components/Achievements';
import { Button } from '@/components/ui';
import { C } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { onAchievement } from '@/lib/events';
import { registerForPush, routeFromData } from '@/lib/notifications';
import { persistOptions, queryClient } from '@/lib/query';
import { supabase } from '@/lib/supabase';
import { flush } from '@/lib/sync';
import type { Achievement } from '@/lib/types';

SplashScreen.preventAutoHideAsync();

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: C.primary, background: C.bg, card: C.white } };

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* Restores the on-device cache so screens render offline, then resumes normally. */}
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <AuthProvider>
          <ThemeProvider value={theme}>
            <StatusBar style="dark" />
            <RootNavigator />
            <AchievementHost />
          </ThemeProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { isLoadingAuth, isAuthenticated, suspended, authTimedOut, retryAuth } = useAuth();

  useEffect(() => {
    if (!isLoadingAuth) SplashScreen.hideAsync();
  }, [isLoadingAuth]);

  if (isLoadingAuth) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.sub}>Loading session...</Text>
      </View>
    );
  }

  if (suspended) {
    return (
      <View style={styles.center}>
        <View style={[styles.circle, { backgroundColor: '#fee2e2' }]}>
          <Text style={{ fontSize: 26 }}>🚫</Text>
        </View>
        <Text style={styles.title}>Account Suspended</Text>
        <Text style={styles.body}>
          Your account has been suspended by an administrator. Please contact{' '}
          <Text style={{ color: C.primary }} onPress={() => Linking.openURL('mailto:cognitrix.iiitd@gmail.com')}>
            cognitrix.iiitd@gmail.com
          </Text>{' '}
          for assistance.
        </Text>
        <Button title="Try Again" variant="outline" onPress={retryAuth} />
      </View>
    );
  }

  if (authTimedOut && !isAuthenticated) {
    return (
      <View style={styles.center}>
        <View style={[styles.circle, { backgroundColor: '#ffedd5' }]}>
          <Text style={{ fontSize: 26 }}>⚠️</Text>
        </View>
        <Text style={styles.title}>Connection Timeout</Text>
        <Text style={styles.body}>We couldn't connect to the authentication server. This usually happens if the server is waking up or your connection is unstable.</Text>
        <Button title="Try Again" onPress={retryAuth} />
      </View>
    );
  }

  return (
    <>
      {isAuthenticated ? <SessionEffects /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="login" />
          <Stack.Screen name="professor-signup" />
        </Stack.Protected>
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="index" />
          <Stack.Screen name="student" />
          <Stack.Screen name="professor" />
          <Stack.Screen name="admin" />
          <Stack.Screen name="course/[id]" />
          <Stack.Screen name="player/[id]" />
          <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications', headerTintColor: C.black, headerBackTitle: 'Back' }} />
          <Stack.Screen name="settings" options={{ headerShown: true, title: 'Account', headerTintColor: C.black, headerBackTitle: 'Back' }} />
          <Stack.Screen name="tutor" options={{ presentation: 'modal' }} />
          <Stack.Screen name="viewer" />
          <Stack.Screen name="downloads" options={{ headerShown: true, title: 'Downloads', headerTintColor: C.black, headerBackTitle: 'Back' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** Side-effects that only run while signed in: push registration, tap routing, realtime. */
function SessionEffects() {
  const { user } = useAuth();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledId = useRef<string | null>(null);

  // Send changes made offline: at sign-in, on reconnect, and whenever the app comes back to the foreground.
  useEffect(() => {
    if (!user) return;
    flush(user.id);
    const unsubOnline = onlineManager.subscribe((online) => {
      if (online) flush(user.id);
    });
    const appState = AppState.addEventListener('change', (st) => {
      if (st === 'active') flush(user.id);
    });
    return () => {
      unsubOnline();
      appState.remove();
    };
  }, [user]);

  // Register this device for remote push (silently no-ops in Expo Go / simulators).
  useEffect(() => {
    if (user) registerForPush();
  }, [user]);

  // Open the right screen when a notification is tapped (also handles cold starts).
  useEffect(() => {
    if (!lastResponse || lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = lastResponse.notification.request.identifier;
    if (handledId.current === id) return;
    handledId.current = id;
    const data = lastResponse.notification.request.content.data as Record<string, any>;
    const route = routeFromData(data);
    if (data?.notification_id) {
      supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', data.notification_id).then(() => {
        queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      });
    }
    if (route) setTimeout(() => router.push(route as Href), 50);
  }, [lastResponse]);

  // Live updates: changes made on the website (new answers, enrollments, notifications)
  // refresh the app instantly instead of waiting for the next pull-to-refresh.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments', filter: `student_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['student-enrollments'] });
        queryClient.invalidateQueries({ queryKey: ['my-enrollments'] });
        queryClient.invalidateQueries({ queryKey: ['enrollment'] });
        queryClient.invalidateQueries({ queryKey: ['player-enrollment'] });
      })
      // Progress made on the website shows up on the phone straight away.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_stats', filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['student-stats'] });
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'achievements', filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['student-achievements'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookmarks', filter: `user_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['my-bookmarks'] });
        queryClient.invalidateQueries({ queryKey: ['lecture-notes'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return null;
}

/** Shows achievement celebrations from anywhere — including ones earned by offline progress that just synced. */
function AchievementHost() {
  const [queue, setQueue] = useState<Achievement[]>([]);
  useEffect(() => onAchievement((a) => setQueue((q) => [...q, a])), []);
  const close = useCallback(() => setQueue((q) => q.slice(1)), []);
  return <AchievementToast achievement={queue[0] ?? null} onClose={close} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, padding: 24, gap: 12 },
  circle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600', color: C.gray900 },
  sub: { fontSize: 14, color: C.gray500 },
  body: { fontSize: 14, color: C.gray500, textAlign: 'center', maxWidth: 320, marginBottom: 8, lineHeight: 20 },
});
