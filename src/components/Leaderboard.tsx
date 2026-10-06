import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';

import { C, R } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

import { Badge, Row, Skeleton } from './ui';

type Entry = {
  id: string;
  user_id: string;
  total_points: number;
  level: number;
  current_streak_days: number;
  user_name: string;
  rank?: number;
};

const SELECT = 'id, user_id, total_points, level, current_streak_days, profiles!inner(full_name, avatar_url, role)';

function mapRow(r: any): Entry {
  return { ...r, user_name: r.profiles?.full_name || 'Student' };
}

export default function Leaderboard({ currentUserId }: { currentUserId?: string }) {
  const { data: stats = [], isLoading } = useQuery({
    queryKey: ['leaderboard', null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_stats')
        .select(SELECT)
        .eq('profiles.role', 'student')
        .order('total_points', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []).map(mapRow);
    },
  });

  const inList = currentUserId ? stats.find((s) => s.user_id === currentUserId) : null;

  const { data: mine } = useQuery({
    queryKey: ['leaderboard-my-rank', currentUserId],
    queryFn: async () => {
      const { data: my } = await supabase.from('student_stats').select(SELECT).eq('profiles.role', 'student').eq('user_id', currentUserId!).maybeSingle();
      if (!my) return null;
      const { count } = await supabase
        .from('student_stats')
        .select('profiles!inner(role)', { count: 'exact', head: true })
        .eq('profiles.role', 'student')
        .gt('total_points', (my as any).total_points);
      return { ...mapRow(my), rank: (count ?? 0) + 1 };
    },
    enabled: !!currentUserId && !isLoading && !inList,
  });

  if (isLoading) {
    return (
      <View style={{ gap: 8 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={56} />
        ))}
      </View>
    );
  }

  if (stats.length === 0) return <Text style={{ textAlign: 'center', color: C.gray400, paddingVertical: 32 }}>No students yet</Text>;

  const renderRow = (s: Entry, index: number, pinned = false) => {
    const me = s.user_id === currentUserId;
    const levelColors = s.level >= 50 ? { bg: C.purple100, fg: C.purple700 } : s.level >= 25 ? { bg: C.blue100, fg: C.blue700 } : { bg: C.gray100, fg: C.gray600 };
    return (
      <View key={s.id + (pinned ? '-pin' : '')} style={[styles.row, me ? styles.rowMe : index < 3 && !pinned ? styles.rowTop : null, pinned && { borderStyle: 'dashed' }]}>
        <View style={styles.rank}>
          {index < 3 ? <Text style={{ fontSize: 20 }}>{['🥇', '🥈', '🥉'][index]}</Text> : <Text style={styles.rankText}>#{index + 1}</Text>}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.name, me && { color: C.primary }]} numberOfLines={1}>
            {s.user_name}
            {me ? <Text style={{ fontSize: 12, color: C.primary }}> (You)</Text> : null}
          </Text>
          <Row gap={8} style={{ marginTop: 3 }}>
            <Badge label={`Level ${s.level}`} bg={levelColors.bg} color={levelColors.fg} border={levelColors.bg} />
            {s.current_streak_days > 0 ? <Text style={{ fontSize: 12, color: C.orange600 }}>🔥 {s.current_streak_days} days</Text> : null}
          </Row>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.points}>{s.total_points}</Text>
          <Text style={{ fontSize: 11, color: C.gray500 }}>points</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={{ gap: 8 }}>
      {stats.map((s, i) => renderRow(s, i))}
      {mine && !inList ? (
        <>
          <Row style={{ paddingVertical: 4 }}>
            <View style={styles.dash} />
            <Text style={{ fontSize: 12, color: C.gray400 }}>Your Position</Text>
            <View style={styles.dash} />
          </Row>
          {renderRow(mine, (mine.rank ?? 1) - 1, true)}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: R.md, borderWidth: 1, borderColor: C.gray100, backgroundColor: C.white },
  rowMe: { backgroundColor: C.primary5, borderColor: C.primary30 },
  rowTop: { backgroundColor: C.gray50, borderColor: C.gray200 },
  rank: { width: 32, alignItems: 'center' },
  rankText: { fontSize: 13, fontWeight: '700', color: C.gray500 },
  name: { fontSize: 14, fontWeight: '500', color: C.black },
  points: { fontSize: 18, fontWeight: '700', color: C.primary },
  dash: { flex: 1, borderTopWidth: 1, borderStyle: 'dashed', borderColor: C.gray200 },
});
