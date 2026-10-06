import { useQuery } from '@tanstack/react-query';
import { BookOpen, Monitor } from 'lucide-react-native';
import { useState } from 'react';

import CourseCard from '@/components/CourseCard';
import { Banner, EmptyState, PageHeader, PageSkeleton, Screen, SegmentedTabs } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Course } from '@/lib/types';

type Filter = 'all' | 'published' | 'draft';

export default function ProfessorCourses() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');

  const q = useQuery({
    queryKey: ['prof-all-courses', user?.id],
    queryFn: async () => {
      const own = await supabase
        .from('courses')
        .select('id, title, status, thumbnail_url, created_at, enrollment_count, category, short_description')
        .eq('professor_id', user!.id)
        .order('created_at', { ascending: false });
      if (own.error) throw own.error;
      // Courses this professor collaborates on (accepted invitations).
      const collab = await supabase.from('course_collaborators').select('courses(id, title, status, thumbnail_url, created_at, enrollment_count, category, short_description)').eq('professor_id', user!.id);
      const extra = (collab.data || []).map((r: any) => r.courses).filter(Boolean) as Course[];
      const seen = new Set<string>();
      return [...(own.data as Course[]), ...extra].filter((c) => !seen.has(c.id) && !!seen.add(c.id));
    },
    enabled: !!user,
  });

  if (q.isLoading) return <PageSkeleton />;
  const courses = (q.data ?? []).filter((c) => filter === 'all' || c.status === filter);

  return (
    <Screen edges={[]} onRefresh={q.refetch}>
      <PageHeader title="My Courses" subtitle={`${q.data?.length ?? 0} courses`} />
      <Banner tone="blue" icon={Monitor} title="Editing happens on the website" description="Create courses, add lectures and generate quizzes on the Cognitrix website. Changes sync here instantly." />
      <SegmentedTabs<Filter>
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: 'all', label: 'All' },
          { value: 'published', label: 'Published' },
          { value: 'draft', label: 'Drafts' },
        ]}
      />
      {courses.length === 0 ? <EmptyState icon={BookOpen} title="No courses" description="Courses you create or collaborate on will appear here." /> : courses.map((c) => <CourseCard key={c.id} course={c} showStatus />)}
    </Screen>
  );
}
