import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Award, Star, TrendingUp, Trophy, type LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AchievementBadge } from '@/components/Achievements';
import Leaderboard from '@/components/Leaderboard';
import { Card, PageHeader, PageSkeleton, ProgressBar, Row, Screen, SegmentedTabs } from '@/components/ui';
import { C, R } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Achievement } from '@/lib/types';

export default function StudentAchievements() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'achievements' | 'leaderboard'>('achievements');

  const statsQ = useQuery({
    queryKey: ['student-stats', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('student_stats')
        .select('id, total_points, level, courses_completed, quizzes_completed, perfect_quiz_count, current_streak_days, longest_streak_days')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const achQ = useQuery({
    queryKey: ['student-achievements', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('achievements')
        .select('id, achievement_type, badge_name, badge_description, badge_icon, points_awarded, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Achievement[];
    },
    enabled: !!user,
  });

  if (statsQ.isLoading) return <PageSkeleton variant="dashboard" />;
  const stats = statsQ.data;
  const achievements = achQ.data ?? [];
  const points = stats?.total_points || 0;
  const level = stats?.level || 1;

  return (
    <Screen edges={[]} onRefresh={() => Promise.all([statsQ.refetch(), achQ.refetch()])}>
      <PageHeader title="My Achievements" />

      <View style={{ gap: 12, marginBottom: 24 }}>
        <Row gap={12}>
          <GradientStat icon={Trophy} label="Level" value={level} from={C.purple50} border="#f3e8ff" fg={C.purple600} label2={C.purple700} val={C.purple900}>
            <View style={{ marginTop: 10 }}>
              <ProgressBar value={((points % 1000) / 1000) * 100} height={8} color={C.purple600} track={C.purple100} />
              <Text style={{ fontSize: 11, color: C.purple600, marginTop: 4 }}>
                {1000 - (points % 1000)} pts to Level {level + 1}
              </Text>
            </View>
          </GradientStat>
          <GradientStat icon={Star} label="Total Points" value={points} from={C.amber50} border={C.amber100} fg={C.amber600} label2={C.amber700} val={C.amber900} />
        </Row>
        <Row gap={12}>
          <GradientStat icon={Award} label="Achievements" value={achievements.length} from={C.emerald50} border={C.emerald100} fg={C.emerald600} label2={C.emerald700} val="#064e3b" />
          <GradientStat icon={TrendingUp} label="Streak" value={`${stats?.current_streak_days || 0} days`} from={C.orange50} border={C.orange100} fg={C.orange600} label2={C.orange700} val={C.orange900} />
        </Row>
      </View>

      <SegmentedTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'achievements', label: 'My Badges' },
          { value: 'leaderboard', label: 'Leaderboard' },
        ]}
      />

      {tab === 'achievements' ? (
        <Card style={{ padding: 20 }}>
          <Text style={styles.cardTitle}>Unlocked Badges ({achievements.length})</Text>
          {achievements.length === 0 ? (
            <Text style={{ textAlign: 'center', fontSize: 14, color: C.gray400, paddingVertical: 40 }}>Complete courses and quizzes to earn achievements!</Text>
          ) : (
            <View style={styles.grid}>
              {achievements.map((a) => (
                <View key={a.id} style={styles.gridItem}>
                  <AchievementBadge achievement={a} />
                </View>
              ))}
            </View>
          )}
        </Card>
      ) : (
        <Card style={{ padding: 16 }}>
          <Text style={styles.cardTitle}>🏆 Top Learners</Text>
          <Leaderboard currentUserId={user?.id} />
        </Card>
      )}
    </Screen>
  );
}

function GradientStat({ icon: Icon, label, value, from, border, fg, label2, val, children }: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  from: string;
  border: string;
  fg: string;
  label2: string;
  val: string;
  children?: ReactNode;
}) {
  return (
    <LinearGradient colors={[from, '#ffffff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.gstat, { borderColor: border }]}>
      <Row style={{ marginBottom: 6 }}>
        <Icon size={18} color={fg} />
        <Text style={{ fontSize: 12, fontWeight: '500', color: label2 }}>{label}</Text>
      </Row>
      <Text style={{ fontSize: 26, fontWeight: '700', color: val }}>{value}</Text>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gstat: { flex: 1, borderRadius: R.lg, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: C.black, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  gridItem: { width: '50%', padding: 6 },
});
