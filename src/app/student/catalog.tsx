import { useQuery } from '@tanstack/react-query';
import { BookOpen, Search, SlidersHorizontal } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import CourseCard from '@/components/CourseCard';
import { Badge, EmptyState, PageHeader, PageSkeleton, Row, Screen, Select, s } from '@/components/ui';
import { C } from '@/constants/theme';
import { categories } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Course } from '@/lib/types';

const difficulties = [
  { value: 'all', label: 'All Levels' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];
const sorts = [
  { value: 'recent', label: 'Most Recent' },
  { value: 'popular', label: 'Most Popular' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'difficulty', label: 'By Difficulty' },
];

export default function CourseCatalog() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [sortBy, setSortBy] = useState('recent');

  const coursesQ = useQuery({
    queryKey: ['catalog-courses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, short_description, category, difficulty_level, tags, professor_name, instructor_rating, enrollment_count, thumbnail_url, created_at, estimated_hours')
        .eq('status', 'published')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Course[];
    },
  });

  const lecturesQ = useQuery({
    queryKey: ['all-lectures'],
    queryFn: async () => {
      const { data, error } = await supabase.from('lectures').select('id, course_id, duration_minutes');
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const order: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };
    return (coursesQ.data ?? [])
      .filter(
        (c) =>
          (category === 'all' || c.category === category) &&
          (difficulty === 'all' || c.difficulty_level === difficulty) &&
          (!q || c.title.toLowerCase().includes(q) || c.short_description?.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        if (sortBy === 'rating') return (b.instructor_rating || 0) - (a.instructor_rating || 0);
        if (sortBy === 'popular') return (b.enrollment_count || 0) - (a.enrollment_count || 0);
        if (sortBy === 'difficulty') return (order[a.difficulty_level ?? ''] || 0) - (order[b.difficulty_level ?? ''] || 0);
        return new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime();
      });
  }, [coursesQ.data, search, category, difficulty, sortBy]);

  if (coursesQ.isLoading) return <PageSkeleton />;

  return (
    <Screen edges={[]} onRefresh={() => Promise.all([coursesQ.refetch(), lecturesQ.refetch()])}>
      <PageHeader title="Course Catalog" subtitle="Discover and enroll in courses" />

      <View style={{ gap: 10, marginBottom: 20 }}>
        <View style={{ justifyContent: 'center' }}>
          <Search size={16} color={C.gray400} style={{ position: 'absolute', left: 12, zIndex: 1 }} />
          <TextInput placeholder="Search courses..." placeholderTextColor={C.gray400} value={search} onChangeText={setSearch} style={[s.input, { paddingLeft: 36 }]} returnKeyType="search" />
        </View>
        <Select value={category} options={categories} onChange={setCategory} icon={SlidersHorizontal} />
        <Row gap={10}>
          <Select value={difficulty} options={difficulties} onChange={setDifficulty} style={{ flex: 1 }} />
          <Select value={sortBy} options={sorts} onChange={setSortBy} style={{ flex: 1 }} />
        </Row>
        <Badge label={`${filtered.length} courses`} />
      </View>

      {filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="No courses found" description={search || category !== 'all' ? 'Try adjusting your filters' : 'No published courses available yet.'} />
      ) : (
        filtered.map((course) => {
          const duration = (lecturesQ.data ?? []).filter((l) => l.course_id === course.id).reduce((sum, l) => sum + (l.duration_minutes || 0), 0);
          return <CourseCard key={course.id} course={course} duration={duration} />;
        })
      )}
    </Screen>
  );
}
