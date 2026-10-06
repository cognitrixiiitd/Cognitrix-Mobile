import { CloudOff, RefreshCw } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { C } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useIsOnline } from '@/lib/network';
import { flush, usePendingCount } from '@/lib/sync';

/** Thin status strip: offline mode, or changes still waiting to sync. */
export default function OfflineBanner() {
  const online = useIsOnline();
  const { user } = useAuth();
  const pending = usePendingCount(user?.id);

  if (online && pending === 0) return null;

  const changes = `${pending} change${pending === 1 ? '' : 's'}`;
  return (
    <Pressable onPress={() => online && user && flush(user.id)} style={[styles.bar, online ? styles.syncing : styles.offline]}>
      {online ? <RefreshCw size={13} color={C.blue700} /> : <CloudOff size={13} color={C.gray700} />}
      <Text style={[styles.text, { color: online ? C.blue700 : C.gray700 }]} numberOfLines={1}>
        {online ? `Syncing ${changes}…` : pending > 0 ? `Offline · ${changes} will sync when you reconnect` : "Offline · showing saved content and downloads"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 6 },
  offline: { backgroundColor: C.gray100 },
  syncing: { backgroundColor: C.blue50 },
  text: { fontSize: 12, fontWeight: '500', flex: 1 },
});
