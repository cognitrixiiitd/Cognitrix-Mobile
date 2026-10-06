import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Bookmark, BookOpen, Clock, GraduationCap, HardDriveDownload, Play, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, PageHeader, PageSkeleton, ProgressBar, Row, Screen, SegmentedTabs } from '@/components/ui';
import { C, R } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useDownloads } from '@/lib/downloads';
import { formatTime, shortDate } from '@/lib/format';
import { OFFLINE_MESSAGE, useIsOnline } from '@/lib/network';
import { deleteBookmark } from '@/lib/progress';
import { supabase } from '@/lib/supabase';
import type { Course, Enrollment } from '@/lib/types';

type Tab = 'active' | 'completed' | 'bookmarks';

export default function MyLearning() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('active');
  const online = useIsOnline();
  const downloads = useDownloads();

  const enrollmentsQ = useQuery({
    queryKey: ['my-enrollments', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('enrollments').select('id, course_id, status, progress_percent, time_spent_minutes').eq('student_id', user!.id);
      if (error) throw error;
      return (data || []) as Enrollment[];
    },
    enabled: !!user,
  });
  const enrollments = enrollmentsQ.data ?? [];
  const courseIds = enrollments.map((e) => e.course_id);

  const coursesQ = useQuery({
    queryKey: ['my-courses', courseIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase.from('courses').select('id, title, professor_name, thumbnail_url').in('id', courseIds);
      if (error) throw error;
      return (data || []) as Course[];
    },
    enabled: courseIds.length > 0,
  });

  const bookmarksQ = useQuery({
    queryKey: ['my-bookmarks', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookmarks')
        .select('id, course_id, lecture_id, timestamp_seconds, note, created_at, lectures(title), courses(title)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const pendingQ = useQuery({
    queryKey: ['my-pending-requests', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollment_requests')
        .select('id, course_id, status, created_at, courses(title, professor_name)')
        .eq('student_id', user!.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });

  const unenroll = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('enrollments').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      const key = ['my-enrollments', user?.id];
      const prev = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old: Enrollment[] = []) => old.filter((e) => e.id !== id));
      return { prev, key };
    },
    onError: (_e, _v, ctx) => ctx && queryClient.setQueryData(ctx.key, ctx.prev),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['my-enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['student-enrollments'] });
    },
  });

  if (enrollmentsQ.isLoading) return <PageSkeleton />;

  const active = enrollments.filter((e) => e.status === 'active');
  const completed = enrollments.filter((e) => e.status === 'completed');
  const bookmarks = bookmarksQ.data ?? [];
  const pending = pendingQ.data ?? [];

  const confirmUnenroll = (e: Enrollment, title: string) =>
    !online ? Alert.alert('You’re offline', OFFLINE_MESSAGE) : Alert.alert('Leave course?', `You will lose access to "${title}" and your progress in it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unenroll', style: 'destructive', onPress: () => unenroll.mutate(e.id) },
    ]);

  const renderCourse = (e: Enrollment) => {
    const course = coursesQ.data?.find((c) => c.id === e.course_id);
    if (!course) return null;
    return (
      <Card key={e.id} style={{ marginBottom: 12 }}>
        <Pressable onPress={() => router.push(`/player/${course.id}`)}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: C.black }}>{course.title}</Text>
          <Text style={{ fontSize: 12, color: C.gray400, marginTop: 4 }}>{course.professor_name}</Text>
        </Pressable>
        <Row style={{ justifyContent: 'space-between', marginTop: 12, marginBottom: 6 }}>
          <Text style={{ fontSize: 12, color: C.gray500 }}>{e.progress_percent || 0}% complete</Text>
          <Text style={{ fontSize: 12, color: C.gray500 }}>{e.time_spent_minutes || 0} min</Text>
        </Row>
        <ProgressBar value={e.progress_percent || 0} />
        <Row style={{ marginTop: 12 }}>
          <Button title="Continue" icon={Play} size="sm" style={{ flex: 1 }} onPress={() => router.push(`/player/${course.id}`)} />
          <Button icon={Trash2} variant="ghost" size="sm" onPress={() => confirmUnenroll(e, course.title)} />
        </Row>
      </Card>
    );
  };

  return (
    <Screen edges={[]} onRefresh={() => Promise.all([enrollmentsQ.refetch(), bookmarksQ.refetch(), pendingQ.refetch()])}>
      <PageHeader
        title="My Learning"
        right={<Button title={downloads.length ? `Downloads (${downloads.length})` : 'Downloads'} icon={HardDriveDownload} variant="outline" size="sm" onPress={() => router.push('/downloads')} />}
      />

      {pending.length > 0 ? (
        <View style={{ marginBottom: 24 }}>
          <Row style={{ marginBottom: 12 }}>
            <Clock size={16} color={C.amber500} />
            <Text style={{ fontSize: 16, fontWeight: '600' }}>Pending Enrollment Requests ({pending.length})</Text>
          </Row>
          {pending.map((r) => (
            <Card key={r.id} onPress={() => router.push(`/course/${r.course_id}`)} style={{ backgroundColor: 'rgba(255,251,235,0.5)', borderColor: C.amber200, marginBottom: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: C.black }}>{r.courses?.title || 'Course'}</Text>
              <Text style={{ fontSize: 12, color: C.gray400, marginTop: 4 }}>{r.courses?.professor_name || ''}</Text>
              <Row style={{ marginTop: 10 }}>
                <Badge label="Pending Approval" bg={C.amber100} color={C.amber700} border={C.amber200} />
                <Text style={{ fontSize: 11, color: C.gray400 }}>Requested {shortDate(r.created_at)}</Text>
              </Row>
            </Card>
          ))}
        </View>
      ) : null}

      <SegmentedTabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'active', label: `In Progress (${active.length})` },
          { value: 'completed', label: `Completed (${completed.length})` },
          { value: 'bookmarks', label: `Bookmarks (${bookmarks.length})` },
        ]}
      />

      {tab === 'active' ? (
        active.length === 0 ? (
          <EmptyState icon={BookOpen} title="No active courses" description="Browse the catalog to find courses." actionLabel="Browse Courses" onAction={() => router.push('/student/catalog')} />
        ) : (
          active.map(renderCourse)
        )
      ) : null}

      {tab === 'completed' ? (completed.length === 0 ? <EmptyState icon={GraduationCap} title="No completed courses" description="Complete your first course to see it here." /> : completed.map(renderCourse)) : null}

      {tab === 'bookmarks' ? (
        bookmarks.length === 0 ? (
          <EmptyState icon={Bookmark} title="No bookmarks" description="Bookmark moments in lectures to revisit later." />
        ) : (
          bookmarks.map((b) => (
            <Card key={b.id} style={{ marginBottom: 8, padding: 14 }}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/player/${b.course_id}?lecture=${b.lecture_id}&t=${b.timestamp_seconds || 0}`)}>
                  <Row gap={6} style={{ marginBottom: 4 }}>
                    <Play size={14} color={C.primary} />
                    <Text style={{ fontSize: 14, fontWeight: '500', color: C.black, flex: 1 }} numberOfLines={1}>
                      {b.lectures?.title || 'Lecture Bookmark'}
                    </Text>
                  </Row>
                  {b.courses?.title ? <Text style={{ fontSize: 12, color: C.gray400, marginBottom: 6 }}>{b.courses.title}</Text> : null}
                  {b.timestamp_seconds > 0 ? <Badge label={formatTime(b.timestamp_seconds)} style={{ marginBottom: 4 }} /> : null}
                  {b.note ? (
                    <Text style={{ fontSize: 12, color: C.gray500 }} numberOfLines={2}>
                      {b.note}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable hitSlop={8} onPress={() => user && deleteBookmark(user.id, b.id)} style={{ padding: 6, borderRadius: R.sm }}>
                  <Trash2 size={16} color={C.gray400} />
                </Pressable>
              </Row>
            </Card>
          ))
        )
      ) : null}
    </Screen>
  );
}
