import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Bell, GraduationCap } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, R } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

import OfflineBanner from './OfflineBanner';

export function useUnreadCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications-unread', user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .is('read_at', null);
      if (error) return 0; // table not migrated yet → no badge
      return count ?? 0;
    },
    enabled: !!user,
  });
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.primary10, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.42, fontWeight: '600', color: C.primary }}>{name?.[0]?.toUpperCase() ?? '?'}</Text>
    </View>
  );
}

export default function AppHeader() {
  const insets = useSafeAreaInsets();
  const { profile, user, viewMode } = useAuth();
  const { data: unread = 0 } = useUnreadCount();
  const displayName = profile?.full_name || user?.email || 'User';
  const isStaff = profile?.role === 'professor' || profile?.role === 'admin';

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Row>
          <View style={styles.logo}>
            <GraduationCap size={20} color={C.white} />
          </View>
          <Text style={styles.brand}>Cognitrix</Text>
          {isStaff ? (
            <View style={styles.modePill}>
              <Text style={styles.modeText}>{viewMode === 'professor' ? 'Professor' : 'Student View'}</Text>
            </View>
          ) : null}
        </Row>
        <Row>
          <Pressable hitSlop={8} onPress={() => router.push('/notifications')} style={styles.iconBtn}>
            <Bell size={20} color={C.gray600} />
            {unread > 0 ? (
              <View style={styles.dot}>
                <Text style={styles.dotText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable hitSlop={8} onPress={() => router.push('/settings')}>
            <Avatar name={displayName} />
          </Pressable>
        </Row>
      </View>
      <OfflineBanner />
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>{children}</View>;
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  logo: { width: 32, height: 32, borderRadius: R.sm, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 18, fontWeight: '600', color: C.black, letterSpacing: -0.3 },
  modePill: { borderWidth: 1, borderColor: C.primary30, backgroundColor: C.primary10, borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 2 },
  modeText: { fontSize: 10, fontWeight: '500', color: C.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  iconBtn: { padding: 6 },
  dot: { position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: C.red500, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  dotText: { color: C.white, fontSize: 9, fontWeight: '700' },
});
