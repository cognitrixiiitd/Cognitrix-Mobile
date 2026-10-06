import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CheckCircle, Clock, MessageSquare } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Badge, Card, EmptyState, IconBox, PageHeader, PageSkeleton, Row, Screen } from '@/components/ui';
import { C } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { supabase } from '@/lib/supabase';

export default function StudentQA() {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ['student-questions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('questions')
        .select('id, text, status, course_id, lecture_id, question_answers(id, text, user_name, created_at), created_at, courses(title)')
        .eq('user_id', user!.id)
        .eq('is_stuck_flag', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((x: any) => ({ ...x, answers: x.question_answers || [] }));
    },
    enabled: !!user?.id,
  });

  if (q.isLoading) return <PageSkeleton />;
  const questions = q.data ?? [];

  return (
    <Screen edges={[]} onRefresh={q.refetch}>
      <PageHeader title="My Questions" subtitle="Track your questions and answers from courses" />
      {questions.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No questions yet" description="Ask questions during your course lectures and they'll appear here." />
      ) : (
        questions.map((item: any) => {
          const answered = item.status === 'answered';
          return (
            <Card
              key={item.id}
              style={{ marginBottom: 12 }}
              onPress={item.lecture_id ? () => router.push(`/player/${item.course_id}?lecture=${item.lecture_id}&qa=1`) : undefined}>
              <Row style={{ alignItems: 'flex-start', gap: 12 }}>
                <IconBox icon={answered ? CheckCircle : Clock} color={answered ? C.emerald500 : C.yellow500} bg={answered ? C.emerald50 : C.yellow50} size={32} iconSize={16} radius={8} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: C.black }}>{item.text}</Text>
                  <Row style={{ marginTop: 6, flexWrap: 'wrap' }}>
                    <Badge label={item.status} bg={answered ? C.emerald50 : C.yellow50} color={answered ? C.emerald700 : C.yellow700} border="transparent" />
                    {item.courses?.title ? <Text style={{ fontSize: 11, color: C.gray400 }}>{item.courses.title}</Text> : null}
                    <Text style={{ fontSize: 11, color: C.gray400 }}>· {item.pending ? 'waiting to sync' : timeAgo(item.created_at)}</Text>
                  </Row>
                  {item.answers.map((a: any) => (
                    <View key={a.id} style={{ marginTop: 12, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: C.primary }}>
                      <Text style={{ fontSize: 14, color: C.gray700 }}>{a.text}</Text>
                      <Text style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>{a.user_name}</Text>
                    </View>
                  ))}
                </View>
              </Row>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
