import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertCircle, ArrowLeft, CheckCircle, Clock, FileText, GraduationCap, Play, Users, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CourseThumb } from '@/components/CourseCard';
import { typeIcons } from '@/components/lectureIcons';
import { Badge, Banner, Button, Card, PageSkeleton, Row, Screen } from '@/components/ui';
import { C, R } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { categoryLabels } from '@/lib/format';
import { useIsOnline } from '@/lib/network';
import { supabase } from '@/lib/supabase';
import type { Course, Lecture } from '@/lib/types';

export default function CourseDetail() {
  const { id: courseId } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const online = useIsOnline();

  const courseQ = useQuery({
    queryKey: ['course', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, short_description, long_description, category, tags, professor_name, estimated_hours, enrollment_count, thumbnail_url, difficulty_level, credits, learning_outcomes, prerequisites')
        .eq('id', courseId)
        .single();
      if (error) throw error;
      return data as Course;
    },
    enabled: !!courseId,
  });

  const lecturesQ = useQuery({
    queryKey: ['course-lectures', courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from('lectures').select('id, title, type, duration_minutes, order_index').eq('course_id', courseId).order('order_index');
      if (error) throw error;
      return (data || []) as Lecture[];
    },
    enabled: !!courseId,
  });

  const enrollmentQ = useQuery({
    queryKey: ['enrollment', courseId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('id, student_id, course_id, completed_lectures, status')
        .eq('course_id', courseId)
        .eq('student_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId && !!user,
  });
  const enrollment = enrollmentQ.data;

  const requestQ = useQuery({
    queryKey: ['enrollment-request', courseId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('enrollment_requests').select('id, status, created_at').eq('course_id', courseId).eq('student_id', user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId && !!user && !enrollment,
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('enrollment_requests').insert({ student_id: user!.id, course_id: courseId, status: 'pending', message: null });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['enrollment-request', courseId, user?.id] });
      queryClient.invalidateQueries({ queryKey: ['my-pending-requests'] });
    },
  });

  if (courseQ.isLoading) return <PageSkeleton variant="detail" />;
  const course = courseQ.data;
  if (!course) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <Text style={{ color: C.gray500, textAlign: 'center', paddingHorizontal: 24 }}>
          {online ? 'Course not found' : "This course hasn't been opened on this phone yet, so it isn't available offline."}
        </Text>
        <Button title="Go back" variant="ghost" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const lectures = lecturesQ.data ?? [];
  const isStaff = profile?.role === 'professor' || profile?.role === 'admin';
  const req = requestQ.data;

  const action = () => {
    if (enrollment || req?.status === 'approved') return <Button title="Continue Learning" icon={Play} size="lg" onPress={() => router.push(`/player/${courseId}`)} />;
    if (isStaff) return <Button title="Watch Lectures" icon={Play} size="lg" onPress={() => router.push(`/player/${courseId}`)} />;
    if (req?.status === 'pending') return <Banner tone="amber" icon={Clock} title="Enrollment request pending professor approval" description="We'll send you a notification as soon as you're approved." />;
    if (req?.status === 'rejected') return <Banner tone="red" icon={AlertCircle} title="Your enrollment request was not approved. Contact your professor." />;
    return (
      <View style={{ gap: 8 }}>
        <Button title={requestMutation.isPending ? 'Requesting...' : 'Request to Enroll'} size="lg" loading={requestMutation.isPending} disabled={!online} onPress={() => requestMutation.mutate()} />
        {!online ? <Text style={{ color: C.gray500, fontSize: 13 }}>Connect to the internet to request enrollment.</Text> : null}
        {requestMutation.error ? <Text style={{ color: C.red600, fontSize: 13 }}>{(requestMutation.error as Error).message}</Text> : null}
      </View>
    );
  };

  return (
    <Screen edges={['top']} onRefresh={() => Promise.all([courseQ.refetch(), lecturesQ.refetch(), enrollmentQ.refetch(), requestQ.refetch()])}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ marginBottom: 16 }}>
        <Row gap={6}>
          <ArrowLeft size={16} color={C.gray500} />
          <Text style={{ fontSize: 14, color: C.gray500 }}>Back</Text>
        </Row>
      </Pressable>

      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <CourseThumb uri={course.thumbnail_url} height={190} iconSize={64} />
        <View style={{ padding: 20 }}>
          <Row style={{ flexWrap: 'wrap', marginBottom: 12 }} gap={6}>
            {course.category ? <Badge label={categoryLabels[course.category] || course.category} /> : null}
            {(course.tags || []).map((t, i) => (
              <Badge key={i} label={t} bg={C.gray50} border={C.gray50} />
            ))}
          </Row>
          <Text style={styles.title}>{course.title}</Text>
          {course.short_description ? <Text style={styles.short}>{course.short_description}</Text> : null}
          <Row gap={16} style={{ flexWrap: 'wrap', marginTop: 16 }}>
            <Meta icon={GraduationCap} text={course.professor_name || ''} />
            {course.estimated_hours ? <Meta icon={Clock} text={`${course.estimated_hours} hours`} /> : null}
            <Meta icon={Users} text={`${course.enrollment_count || 0} students`} />
          </Row>
          <View style={{ marginTop: 20 }}>{action()}</View>
        </View>
      </Card>

      {course.long_description ? (
        <Card style={styles.section}>
          <Text style={styles.h}>About This Course</Text>
          <Text style={styles.body}>{course.long_description}</Text>
        </Card>
      ) : null}

      <Card style={styles.section}>
        <Text style={styles.h}>Course Content</Text>
        {lectures.length === 0 ? (
          <Text style={{ fontSize: 14, color: C.gray400 }}>{enrollment || isStaff ? 'No lectures added yet.' : 'Enroll to see the lecture list.'}</Text>
        ) : (
          lectures.map((l) => {
            const Icon = typeIcons[l.type] || FileText;
            const done = enrollment?.completed_lectures?.includes(l.id);
            return (
              <Pressable key={l.id} disabled={!enrollment && !isStaff} onPress={() => router.push(`/player/${courseId}?lecture=${l.id}`)} style={({ pressed }) => [styles.lecture, pressed && { backgroundColor: C.gray50 }]}>
                <View style={[styles.lectureIcon, { backgroundColor: done ? C.emerald50 : C.gray50 }]}>{done ? <CheckCircle size={16} color={C.emerald500} /> : <Icon size={16} color={C.gray400} />}</View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: C.black }} numberOfLines={1}>
                    {l.title}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.gray400, textTransform: 'capitalize' }}>{l.type?.replace('_', ' ')}</Text>
                </View>
                {l.duration_minutes ? <Text style={{ fontSize: 12, color: C.gray400 }}>{l.duration_minutes} min</Text> : null}
              </Pressable>
            );
          })
        )}
      </Card>

      {course.learning_outcomes?.length ? (
        <Card style={styles.section}>
          <Text style={[styles.h, { fontSize: 14 }]}>What You'll Learn</Text>
          {course.learning_outcomes.map((o, i) => (
            <Row key={i} style={{ alignItems: 'flex-start', marginBottom: 8 }}>
              <CheckCircle size={16} color={C.primary} style={{ marginTop: 2 }} />
              <Text style={[styles.body, { flex: 1 }]}>{o}</Text>
            </Row>
          ))}
        </Card>
      ) : null}

      {course.prerequisites?.length ? (
        <Card style={styles.section}>
          <Text style={[styles.h, { fontSize: 14 }]}>Prerequisites</Text>
          {course.prerequisites.map((p, i) => (
            <Text key={i} style={[styles.body, { marginBottom: 6 }]}>
              • {p}
            </Text>
          ))}
        </Card>
      ) : null}

      {course.credits ? (
        <Card style={styles.section}>
          <Text style={[styles.h, { fontSize: 14, marginBottom: 4 }]}>Credits</Text>
          <Text style={{ fontSize: 24, fontWeight: '600', color: C.primary }}>{course.credits}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function Meta({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <Row gap={6}>
      <Icon size={16} color={C.gray400} />
      <Text style={{ fontSize: 14, color: C.gray500 }}>{text}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '600', color: C.black, letterSpacing: -0.5 },
  short: { fontSize: 16, color: C.gray500, marginTop: 8, lineHeight: 22 },
  section: { padding: 20, marginBottom: 16 },
  h: { fontSize: 16, fontWeight: '600', color: C.black, marginBottom: 12 },
  body: { fontSize: 14, color: C.gray600, lineHeight: 21 },
  lecture: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: R.md },
  lectureIcon: { width: 32, height: 32, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' },
});
