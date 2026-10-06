import { router } from 'expo-router';
import { ArrowRightLeft, Bell, BellRing, ChevronRight, Clock, HardDriveDownload, LogOut, Minus, Plus, Shield } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';

import { Avatar } from '@/components/AppHeader';
import { Banner, Button, Card, IconBox, Row, Screen } from '@/components/ui';
import { C } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { formatBytes, removeAll, useDownloads } from '@/lib/downloads';
import { isOnline } from '@/lib/network';
import { getReminderSetting, registerForPush, setStudyReminder, unregisterPush, type ReminderSetting } from '@/lib/notifications';
import { clearOutbox, flush, pendingCount } from '@/lib/sync';

export default function Settings() {
  const { profile, user, signOut, viewMode, setViewMode } = useAuth();
  const [reminder, setReminder] = useState<ReminderSetting>(getReminderSetting);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const downloads = useDownloads();
  const downloadedBytes = downloads.reduce((sum, d) => sum + (d.size || 0), 0);
  const displayName = profile?.full_name || user?.email || 'User';
  const role = profile?.role ?? 'student';
  const isStaff = role === 'professor' || role === 'admin';

  useEffect(() => {
    if (user) registerForPush().then(setPushStatus);
  }, [user]);

  const updateReminder = async (next: ReminderSetting) => {
    setReminder(next);
    const ok = await setStudyReminder(next);
    if (!ok) {
      setReminder({ ...next, enabled: false });
      Alert.alert('Notifications are off', 'Allow notifications for Cognitrix in your phone settings to get study reminders.');
    }
  };

  const doSignOut = async () => {
    if (user) clearOutbox(user.id);
    removeAll();
    await unregisterPush();
    await setStudyReminder({ ...reminder, enabled: false });
    await signOut();
  };

  // Try to send offline changes first; warn before losing anything that can't be sent.
  const confirmSignOut = async () => {
    if (user && isOnline()) await flush(user.id);
    const pending = user ? pendingCount(user.id) : 0;
    Alert.alert(
      'Sign out?',
      pending > 0
        ? `${pending} change${pending === 1 ? '' : 's'} made offline haven't synced yet and will be lost. Connect to the internet first to keep them.`
        : 'Downloaded lectures will be removed from this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: doSignOut },
      ],
    );
  };

  const shiftHour = (d: number) => updateReminder({ ...reminder, hour: (reminder.hour + d + 24) % 24 });
  const timeLabel = `${((reminder.hour + 11) % 12) + 1}:${String(reminder.minute).padStart(2, '0')} ${reminder.hour < 12 ? 'AM' : 'PM'}`;

  const switchMode = () => {
    setViewMode(viewMode === 'professor' ? 'student' : 'professor');
    router.dismissAll();
    router.replace('/');
  };

  const pushCopy: Record<string, { tone: 'green' | 'amber' | 'red'; title: string; description: string }> = {
    ok: { tone: 'green', title: 'Push notifications are on', description: 'You’ll be notified about answers, enrollment approvals and new lectures — even when the change happens on the website.' },
    denied: { tone: 'amber', title: 'Push notifications are blocked', description: 'Enable notifications for Cognitrix in your phone settings.' },
    unsupported: { tone: 'amber', title: 'Push not available in this build', description: 'Remote push needs a development or store build (not Expo Go). In-app notifications still work.' },
    error: { tone: 'red', title: 'Could not register for push', description: 'The push_tokens table may be missing. Run the mobile SQL migration in Supabase.' },
  };

  return (
    <Screen edges={['bottom']}>
      <Card style={{ alignItems: 'center', padding: 24, marginBottom: 16 }}>
        <Avatar name={displayName} size={64} />
        <Text style={{ fontSize: 18, fontWeight: '600', color: C.black, marginTop: 12 }}>{displayName}</Text>
        <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>{user?.email}</Text>
        <Text style={{ fontSize: 12, color: C.gray400, marginTop: 2, textTransform: 'capitalize' }}>{role}</Text>
      </Card>

      {isStaff ? (
        <Card style={{ marginBottom: 16 }}>
          <Row style={{ gap: 12 }}>
            <IconBox icon={role === 'admin' ? Shield : ArrowRightLeft} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600' }}>{viewMode === 'professor' ? 'Professor view' : 'Student view'}</Text>
              <Text style={{ fontSize: 12, color: C.gray500 }}>Switch between teaching and learning, like on the website.</Text>
            </View>
          </Row>
          <Button title={viewMode === 'professor' ? '→ Student View' : role === 'admin' ? '→ Admin' : '→ Professor'} variant="outline" onPress={switchMode} style={{ marginTop: 12 }} />
        </Card>
      ) : null}

      <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray500, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notifications</Text>

      <Card style={{ marginBottom: 12 }}>
        <Row style={{ gap: 12, marginBottom: pushStatus ? 12 : 0 }}>
          <IconBox icon={BellRing} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600' }}>Push notifications</Text>
            <Text style={{ fontSize: 12, color: C.gray500 }}>Course updates sent to this device</Text>
          </View>
        </Row>
        {pushStatus && pushCopy[pushStatus] ? <Banner tone={pushCopy[pushStatus].tone} title={pushCopy[pushStatus].title} description={pushCopy[pushStatus].description} /> : null}
      </Card>

      {role === 'student' || viewMode === 'student' ? (
        <Card style={{ marginBottom: 16 }}>
          <Row style={{ gap: 12 }}>
            <IconBox icon={Bell} color={C.amber500} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600' }}>Daily study reminder</Text>
              <Text style={{ fontSize: 12, color: C.gray500 }}>A nudge to keep your streak going</Text>
            </View>
            <Switch value={reminder.enabled} onValueChange={(v) => updateReminder({ ...reminder, enabled: v })} trackColor={{ true: C.primary, false: C.gray200 }} thumbColor={C.white} />
          </Row>
          {reminder.enabled ? (
            <Row style={{ marginTop: 14, justifyContent: 'space-between', backgroundColor: C.gray50, borderRadius: 12, padding: 10 }}>
              <Row gap={6}>
                <Clock size={16} color={C.gray500} />
                <Text style={{ fontSize: 14, fontWeight: '500' }}>{timeLabel}</Text>
              </Row>
              <Row>
                <Button icon={Minus} variant="outline" size="sm" onPress={() => shiftHour(-1)} />
                <Button icon={Plus} variant="outline" size="sm" onPress={() => shiftHour(1)} />
              </Row>
            </Row>
          ) : null}
        </Card>
      ) : null}

      <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray500, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Offline</Text>
      <Pressable onPress={() => router.push('/downloads')}>
        <Card style={{ marginBottom: 16 }}>
          <Row style={{ gap: 12 }}>
            <IconBox icon={HardDriveDownload} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600' }}>Downloads</Text>
              <Text style={{ fontSize: 12, color: C.gray500 }}>
                {downloads.length ? `${downloads.length} files · ${formatBytes(downloadedBytes)}` : 'Lectures saved for offline study'}
              </Text>
            </View>
            <ChevronRight size={18} color={C.gray400} />
          </Row>
        </Card>
      </Pressable>

      <Button title="Sign Out" icon={LogOut} variant="danger" onPress={confirmSignOut} />
    </Screen>
  );
}
