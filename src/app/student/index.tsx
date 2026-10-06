import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { BookOpen, Clock, GraduationCap, RefreshCw, Sparkles, TrendingUp } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import CourseCard from '@/components/CourseCard';
import { Button, Card, EmptyState, IconBox, PageHeader, PageSkeleton, Row, Screen, SectionTitle, StatCard } from '@/components/ui';
import { C, R } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { categoryLabels } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Course, Enrollment } from '@/lib/types';

export default function StudentDashboard() {
  const { user, profile } = useAuth();

  const enrollmentsQ = useQuery({
    queryKey: ['student-enrollments', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('id, course_id, status, progress_percent, time_spent_minutes, last_accessed')
        .eq('student_id', user!.id)
        .order('last_accessed', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as Enrollment[];
    },
    enabled: !!user,
  });
  const enrollments = enrollmentsQ.data ?? [];
  const courseIds = enrollments.map((e) => e.course_id);

  const coursesQ = useQuery({
    queryKey: ['student-courses', courseIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase.from('courses').select('id, title, professor_name, thumbnail_url, category').in('id', courseIds);
      if (error) throw error;
      return (data || []) as Course[];
    },
    enabled: courseIds.length > 0,
  });
  const courses = coursesQ.data ?? [];

  if (enrollmentsQ.isLoading) return <PageSkeleton variant="dashboard" />;

  const active = enrollments.filter((e) => e.status === 'active');
  const completed = enrollments.filter((e) => e.status === 'completed');
  const totalTime = enrollments.reduce((sum, e) => sum + (e.time_spent_minutes || 0), 0);
  const avgProgress = active.length > 0 ? Math.round(active.reduce((sum, e) => sum + (e.progress_percent || 0), 0) / active.length) : 0;

  return (
    <Screen edges={[]} onRefresh={() => Promise.all([enrollmentsQ.refetch(), coursesQ.refetch()])}>
      <PageHeader title={`Welcome back${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}`} subtitle="Continue your learning journey" />

      <View style={{ gap: 12, marginBottom: 24 }}>
        <Row gap={12}>
          <StatCard title="Enrolled" value={enrollments.length} icon={BookOpen} />
          <StatCard title="Completed" value={completed.length} icon={GraduationCap} color="#10b981" />
        </Row>
        <Row gap={12}>
          <StatCard title="Avg. Progress" value={`${avgProgress}%`} icon={TrendingUp} color="#6366f1" />
          <StatCard title="Time Spent" value={`${Math.round(totalTime / 60)}h`} icon={Clock} color="#f59e0b" />
        </Row>
      </View>

      {active.length > 0 ? (
        <View style={{ marginBottom: 16 }}>
          <SectionTitle>Continue Learning</SectionTitle>
          {active.slice(0, 6).map((e) => {
            const course = courses.find((c) => c.id === e.course_id);
            if (!course) return null;
            return <CourseCard key={course.id} course={course} href={`/player/${course.id}`} progress={e.progress_percent ?? 0} />;
          })}
        </View>
      ) : null}

      {enrollments.length === 0 ? (
        <EmptyState icon={BookOpen} title="No courses yet" description="Browse the course catalog to find courses to enroll in." actionLabel="Browse Courses" onAction={() => router.push('/student/catalog')} />
      ) : null}

      {user ? <RecommendedCourses enrolledIds={courseIds} enrolledCourses={courses} /> : null}
    </Screen>
  );
}

/** Same category-based recommendation logic as the website's RecommendedCourses. */
function RecommendedCourses({ enrolledIds, enrolledCourses }: { enrolledIds: string[]; enrolledCourses: Course[] }) {
  const [recs, setRecs] = useState<(Course & { reason: string })[] | null>(null);
  const [generating, setGenerating] = useState(false);

  const { data: allCourses = [] } = useQuery({
    queryKey: ['all-published-courses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, short_description, category, difficulty_level, tags, professor_name, thumbnail_url, enrollment_count')
        .eq('status', 'published');
      if (error) throw error;
      return (data || []) as Course[];
    },
  });

  const generate = async () => {
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 400));
    const cats = [...new Set(enrolledCourses.map((c) => c.category).filter(Boolean))];
    const scored = allCourses
      .filter((c) => !enrolledIds.includes(c.id))
      .map((c) => {
        const match = cats.includes(c.category);
        return { ...c, score: match ? 3 : 0, reason: match ? `Matches your interest in ${categoryLabels[c.category!] || c.category}` : 'Recommended to expand your skills' };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    setRecs(scored);
    setGenerating(false);
  };

  if (!recs) {
    return (
      <Card style={{ alignItems: 'center', padding: 24, marginTop: 8 }}>
        <IconBox icon={Sparkles} size={48} iconSize={24} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: C.black, marginTop: 14, marginBottom: 6 }}>Personalized Course Recommendations</Text>
        <Text style={{ fontSize: 12, color: C.gray500, textAlign: 'center', marginBottom: 16 }}>Get course suggestions based on your learning history and goals.</Text>
        <Button title={generating ? 'Generating...' : 'Get Recommendations'} icon={Sparkles} loading={generating} onPress={generate} />
      </Card>
    );
  }

  return (
    <View style={{ marginTop: 8 }}>
      <SectionTitle right={<Button title="Refresh" icon={RefreshCw} variant="outline" size="sm" onPress={generate} loading={generating} />}>
        <Text>✨ Recommended for You</Text>
      </SectionTitle>
      {recs.length === 0 ? (
        <Text style={{ fontSize: 14, color: C.gray400, textAlign: 'center', paddingVertical: 32 }}>No recommendations available at this time.</Text>
      ) : (
        recs.map((c) => (
          <View key={c.id}>
            <CourseCard course={c} />
            <View style={{ marginTop: -6, marginBottom: 16, padding: 12, backgroundColor: C.primary5, borderRadius: R.md }}>
              <Text style={{ fontSize: 12, color: C.gray600 }}>
                <Text style={{ fontWeight: '600', color: C.primary }}>Why: </Text>
                {c.reason}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
