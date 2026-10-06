import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { Bell, BookOpen, CheckCheck, CheckCircle, FileQuestion, MessageSquare, UserPlus, XCircle, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { Button, Card, EmptyState, IconBox, PageSkeleton, Row, Screen } from '@/components/ui';
import { C } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { routeFromData } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/lib/types';

const icons: Record<string, { icon: LucideIcon; color: string }> = {
  answer: { icon: MessageSquare, color: C.primary },
  enrolled: { icon: CheckCircle, color: C.emerald500 },
  enroll_rejected: { icon: XCircle, color: C.red500 },
  new_lecture: { icon: BookOpen, color: C.indigo },
  new_quiz: { icon: FileQuestion, color: C.amber500 },
  enroll_request: { icon: UserPlus, color: C.primary },
  question: { icon: MessageSquare, color: C.blue600 },
};

export default function NotificationsScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('notifications').select('id, title, body, data, read_at, created_at').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data || []) as AppNotification[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    Notifications.setBadgeCountAsync(0).catch(() => {});
  }, []);

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
      if (error) throw error;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  if (q.isLoading) return <PageSkeleton />;

  if (q.error) {
    return (
      <Screen edges={[]}>
        <EmptyState icon={Bell} title="Notifications unavailable" description="The notifications table hasn't been set up on the server yet. Run the mobile SQL migration in Supabase." />
      </Screen>
    );
  }

  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read_at).map((n) => n.id);

  return (
    <Screen edges={[]} onRefresh={q.refetch}>
      {unread.length > 0 ? (
        <Row style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
          <Button title="Mark all read" icon={CheckCheck} variant="outline" size="sm" onPress={() => markRead.mutate(unread)} />
        </Row>
      ) : null}
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up" description="Answers to your questions, enrollment approvals and new lectures will show up here." />
      ) : (
        items.map((n) => {
          const meta = icons[n.data?.type] ?? { icon: Bell, color: C.gray400 };
          const route = routeFromData(n.data);
          return (
            <Card
              key={n.id}
              style={{ marginBottom: 8, padding: 14, backgroundColor: n.read_at ? C.white : C.primary5, borderColor: n.read_at ? C.gray100 : C.primary20 }}
              onPress={() => {
                if (!n.read_at) markRead.mutate([n.id]);
                if (route) router.push(route as Href);
              }}>
              <Row style={{ alignItems: 'flex-start', gap: 12 }}>
                <IconBox icon={meta.icon} color={meta.color} size={36} iconSize={18} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: n.read_at ? '500' : '600', color: C.black }}>{n.title}</Text>
                  {n.body ? <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>{n.body}</Text> : null}
                  <Text style={{ fontSize: 11, color: C.gray400, marginTop: 6 }}>{timeAgo(n.created_at)}</Text>
                </View>
                {!n.read_at ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, marginTop: 6 }} /> : null}
              </Row>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
