import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { BookOpen, Check, MessageSquare, TrendingUp, UserPlus, Users, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Avatar } from '@/components/AppHeader';
import CourseCard from '@/components/CourseCard';
import { Banner, Button, Card, EmptyState, PageHeader, PageSkeleton, Row, Screen, SectionTitle, StatCard } from '@/components/ui';
import { C } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { isOnline, OFFLINE_MESSAGE } from '@/lib/network';
import { supabase } from '@/lib/supabase';
import type { Course } from '@/lib/types';

export default function ProfessorDashboard() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [processing, setProcessing] = useState<string | null>(null);

  const coursesQ = useQuery({
    queryKey: ['prof-courses', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, status, thumbnail_url, created_at, enrollment_count, category, short_description')
        .eq('professor_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as Course[];
    },
    enabled: !!user?.id,
  });
  const courses = coursesQ.data ?? [];
  const courseIds = courses.map((c) => c.id);

  const enrollmentsQ = useQuery({
    queryKey: ['prof-enrollments', courseIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase.from('enrollments').select('id, student_id, course_id, progress_percent').in('course_id', courseIds);
      if (error) throw error;
      return data || [];
    },
    enabled: courseIds.length > 0,
  });

  const openQsQ = useQuery({
    queryKey: ['prof-open-questions', courseIds.join(',')],
    queryFn: async () => {
      const { count } = await supabase.from('questions').select('id', { count: 'exact', head: true }).in('course_id', courseIds).eq('status', 'open');
      return count ?? 0;
    },
    enabled: courseIds.length > 0,
  });

  const requestsQ = useQuery({
    queryKey: ['prof-enrollment-requests', courseIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollment_requests')
        .select('id, student_id, course_id, status, message, created_at, courses(title), profiles(full_name, email)')
        .in('course_id', courseIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: courseIds.length > 0,
  });

  // Same two writes as the website's approve flow: create the enrollment, then mark the request approved.
  const approve = async (r: any) => {
    if (!isOnline()) return Alert.alert('You’re offline', OFFLINE_MESSAGE);
    setProcessing(r.id);
    try {
      const { error: e1 } = await supabase.from('enrollments').insert({
        student_id: r.student_id,
        course_id: r.course_id,
        course_title: r.courses?.title || '',
        student_name: r.profiles?.full_name || '',
        student_email: r.profiles?.email || '',
        status: 'active',
        progress_percent: 0,
        completed_lectures: [],
        time_spent_minutes: 0,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('enrollment_requests').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', r.id);
      if (e2) throw e2;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['prof-enrollment-requests'] });
      queryClient.invalidateQueries({ queryKey: ['prof-enrollments'] });
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setProcessing(null);
    }
  };

  const reject = async (r: any) => {
    if (!isOnline()) return Alert.alert('You’re offline', OFFLINE_MESSAGE);
    setProcessing(r.id);
    const { error } = await supabase.from('enrollment_requests').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', r.id);
    setProcessing(null);
    if (error) Alert.alert('Error', error.message);
    else queryClient.invalidateQueries({ queryKey: ['prof-enrollment-requests'] });
  };

  if (coursesQ.isLoading) return <PageSkeleton variant="dashboard" />;

  const enrollments = enrollmentsQ.data ?? [];
  const totalStudents = new Set(enrollments.map((e) => e.student_id)).size;
  const avgCompletion = enrollments.length ? Math.round(enrollments.reduce((s, e) => s + (e.progress_percent || 0), 0) / enrollments.length) : 0;
  const requests = requestsQ.data ?? [];

  return (
    <Screen edges={[]} onRefresh={() => Promise.all([coursesQ.refetch(), enrollmentsQ.refetch(), requestsQ.refetch(), openQsQ.refetch()])}>
      <PageHeader title={`Welcome back${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}`} subtitle="Here's what's happening with your courses" />

      <View style={{ gap: 12, marginBottom: 24 }}>
        <Row gap={12}>
          <StatCard title="Courses" value={courses.length} icon={BookOpen} />
          <StatCard title="Students" value={totalStudents} icon={Users} color="#6366f1" />
        </Row>
        <Row gap={12}>
          <StatCard title="Avg. Completion" value={`${avgCompletion}%`} icon={TrendingUp} color="#10b981" />
          <StatCard title="Open Questions" value={openQsQ.data ?? 0} icon={MessageSquare} color="#f59e0b" />
        </Row>
      </View>

      <SectionTitle>Enrollment Requests {requests.length ? `(${requests.length})` : ''}</SectionTitle>
      {requests.length === 0 ? (
        <Card style={{ marginBottom: 24 }}>
          <EmptyState icon={UserPlus} title="No pending requests" description="When students request to enroll in your courses, they will appear here." />
        </Card>
      ) : (
        <View style={{ marginBottom: 24 }}>
          {requests.map((r) => (
            <Card key={r.id} style={{ marginBottom: 10 }}>
              <Row style={{ gap: 12 }}>
                <Avatar name={r.profiles?.full_name || '?'} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600' }}>{r.profiles?.full_name || 'Student'}</Text>
                  <Text style={{ fontSize: 12, color: C.gray500 }} numberOfLines={1}>
                    {r.profiles?.email}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.gray400, marginTop: 2 }} numberOfLines={1}>
                    {r.courses?.title} · {timeAgo(r.created_at)}
                  </Text>
                </View>
              </Row>
              <Row style={{ marginTop: 12 }}>
                <Button title="Approve" icon={Check} size="sm" style={{ flex: 1 }} loading={processing === r.id} disabled={!!processing} onPress={() => approve(r)} />
                <Button title="Reject" icon={X} size="sm" variant="danger" style={{ flex: 1 }} disabled={!!processing} onPress={() => reject(r)} />
              </Row>
            </Card>
          ))}
        </View>
      )}

      <SectionTitle right={courses.length > 3 ? <Button title="View all" variant="ghost" size="sm" onPress={() => router.push('/professor/courses')} /> : undefined}>Recent Courses</SectionTitle>
      {courses.length === 0 ? (
        <Banner tone="blue" icon={BookOpen} title="No courses yet" description="Create your first course on the Cognitrix website — it will appear here automatically." />
      ) : (
        courses.slice(0, 3).map((c) => <CourseCard key={c.id} course={c} showStatus />)
      )}
    </Screen>
  );
}
