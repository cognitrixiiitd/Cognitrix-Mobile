import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const REMINDER_KEY = 'cognitrix:study-reminder';
const REMINDER_ID = 'daily-study-reminder';

async function ensureAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Course updates',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: '#00a98d',
  });
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Study reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function requestPermission(): Promise<boolean> {
  await ensureAndroidChannels();
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const { granted } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return granted;
}

/**
 * Registers this device's Expo push token against the signed-in user in Supabase.
 * Server-side triggers (supabase/migrations/mobile_push_notifications.sql) send pushes
 * to these tokens whenever something relevant happens — including actions taken on the website.
 * Returns a status string for display in Settings.
 */
export async function registerForPush(): Promise<'ok' | 'denied' | 'unsupported' | 'error'> {
  try {
    if (!Device.isDevice) return 'unsupported';
    const granted = await requestPermission();
    if (!granted) return 'denied';

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('[push] No EAS projectId — run `eas init` to enable remote push.');
      return 'unsupported';
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    // RPC (not a plain upsert) so a token previously owned by another account on this phone is reassigned.
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) {
      console.warn('[push] token save failed:', error.message);
      return 'error';
    }
    return 'ok';
  } catch (err) {
    // Remote push is not available in Expo Go on Android (SDK 53+); needs a development build.
    console.warn('[push] registration failed:', err);
    return 'unsupported';
  }
}

export async function unregisterPush() {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId || !Device.isDevice) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').delete().eq('token', token);
  } catch {
    // ignore
  }
}

export type ReminderSetting = { enabled: boolean; hour: number; minute: number };

export function getReminderSetting(): ReminderSetting {
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { enabled: false, hour: 19, minute: 0 };
}

/** Local daily reminder — works offline and in Expo Go. */
export async function setStudyReminder(setting: ReminderSetting) {
  localStorage.setItem(REMINDER_KEY, JSON.stringify(setting));
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
  if (!setting.enabled) return true;
  if (!(await requestPermission())) return false;
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'Time to learn 📚',
      body: 'Keep your streak going — pick up where you left off on Cognitrix.',
      data: { url: '/student' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: setting.hour,
      minute: setting.minute,
      channelId: 'reminders',
    },
  });
  return true;
}

/** Maps a notification payload (set by the SQL triggers) to an in-app route. */
export function routeFromData(data: Record<string, any> | null | undefined): string | null {
  if (!data) return null;
  if (typeof data.url === 'string') return data.url;
  switch (data.type) {
    case 'answer':
      return data.course_id && data.lecture_id
        ? `/player/${data.course_id}?lecture=${data.lecture_id}&qa=1`
        : '/student/qa';
    case 'enrolled':
    case 'new_lecture':
    case 'new_quiz':
      return data.course_id ? `/player/${data.course_id}${data.lecture_id ? `?lecture=${data.lecture_id}` : ''}` : null;
    case 'enroll_rejected':
      return data.course_id ? `/course/${data.course_id}` : null;
    case 'enroll_request':
      return '/professor';
    case 'question':
      return '/professor/qa';
    default:
      return null;
  }
}
