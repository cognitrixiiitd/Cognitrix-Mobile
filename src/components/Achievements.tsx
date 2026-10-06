import * as Haptics from 'expo-haptics';
import { Award, BookOpen, Crown, Flame, Medal, Star, Target, Trophy, Zap, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { C, R } from '@/constants/theme';
import type { Achievement } from '@/lib/types';

const iconMap: Record<string, LucideIcon> = {
  first_course: BookOpen,
  course_completed: Trophy,
  quiz_ace: Award,
  perfect_score: Star,
  fast_learner: Zap,
  question_master: Target,
  bookmark_king: BookOpen,
  week_streak: Flame,
  month_streak: Crown,
  topic_master: Medal,
};

const colorMap: Record<string, { bg: string; fg: string; border: string }> = {
  first_course: { bg: '#dbeafe', fg: '#1d4ed8', border: '#bfdbfe' },
  course_completed: { bg: '#f3e8ff', fg: '#7e22ce', border: '#e9d5ff' },
  quiz_ace: { bg: '#fef3c7', fg: '#b45309', border: '#fde68a' },
  perfect_score: { bg: '#fef9c3', fg: '#a16207', border: '#fef08a' },
  fast_learner: { bg: '#d1fae5', fg: '#047857', border: '#a7f3d0' },
  question_master: { bg: '#fce7f3', fg: '#be185d', border: '#fbcfe8' },
  bookmark_king: { bg: '#e0e7ff', fg: '#4338ca', border: '#c7d2fe' },
  week_streak: { bg: '#ffedd5', fg: '#c2410c', border: '#fed7aa' },
  month_streak: { bg: '#fee2e2', fg: '#b91c1c', border: '#fecaca' },
  topic_master: { bg: '#ccfbf1', fg: '#0f766e', border: '#99f6e4' },
};

export function AchievementBadge({ achievement }: { achievement: Achievement }) {
  const Icon = iconMap[achievement.achievement_type] || Trophy;
  const c = colorMap[achievement.achievement_type] || { bg: C.gray100, fg: C.gray700, border: C.gray200 };
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Icon size={32} color={c.fg} />
      <Text style={[styles.name, { color: c.fg }]}>{achievement.badge_name}</Text>
      {achievement.badge_description ? <Text style={[styles.desc, { color: c.fg }]}>{achievement.badge_description}</Text> : null}
      <View style={styles.pts}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: C.gray700 }}>+{achievement.points_awarded ?? 0} pts</Text>
      </View>
    </View>
  );
}

/** Celebration popup — mobile counterpart of AchievementNotification (confetti → haptics + spring). */
export function AchievementToast({ achievement, onClose }: { achievement: Achievement | null; onClose: () => void }) {
  const scale = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    if (!achievement) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    scale.setValue(0.8);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [achievement, onClose, scale]);

  return (
    <Modal visible={!!achievement} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View style={[styles.toast, { transform: [{ scale }] }]}>
          <Text style={styles.toastTitle}>🎉 Achievement Unlocked!</Text>
          {achievement ? <AchievementBadge achievement={achievement} /> : null}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 2, borderRadius: R.md, padding: 16, alignItems: 'center', flex: 1 },
  name: { fontWeight: '600', fontSize: 14, marginTop: 8, textAlign: 'center' },
  desc: { fontSize: 12, opacity: 0.8, marginTop: 4, textAlign: 'center' },
  pts: { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.full },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 32 },
  toast: { backgroundColor: C.white, borderRadius: R.lg, borderWidth: 2, borderColor: C.primary, padding: 24 },
  toastTitle: { textAlign: 'center', fontSize: 14, fontWeight: '600', color: C.primary, marginBottom: 16 },
});
