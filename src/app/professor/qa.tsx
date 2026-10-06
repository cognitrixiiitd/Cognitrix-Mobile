import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Flag, MessageSquare, Send } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Text, View } from 'react-native';

import { Badge, Button, Card, EmptyState, Field, IconBox, PageHeader, PageSkeleton, Row, Screen, SegmentedTabs } from '@/components/ui';
import { C } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { isOnline, OFFLINE_MESSAGE } from '@/lib/network';
import { supabase } from '@/lib/supabase';
import type { Question } from '@/lib/types';

type Filter = 'open' | 'answered' | 'all';

export default function ProfessorQA() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('open');
  const [reply, setReply] = useState<Record<string, string>>({});

  const coursesQ = useQuery({
    queryKey: ['qa-courses', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('courses').select('id, title').eq('professor_id', user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });
  const courses = coursesQ.data ?? [];
  const courseIds = courses.map((c) => c.id);

  const q = useQuery({
    queryKey: ['qa-questions', courseIds.join(','), filter],
    queryFn: async () => {
      let query = supabase
        .from('questions')
        .select('id, text, user_name, course_id, status, is_stuck_flag, question_answers(id, text, user_name, created_at), created_at')
        .in('course_id', courseIds);
      if (filter !== 'all') query = query.eq('status', filter);
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((x: any) => ({ ...x, answers: x.question_answers || [], course_title: courses.find((c) => c.id === x.course_id)?.title })) as Question[];
    },
    enabled: courseIds.length > 0,
  });

  const replyMutation = useMutation({
    mutationFn: async ({ questionId, text }: { questionId: string; text: string }) => {
      const { error: e1 } = await supabase.from('question_answers').insert({ question_id: questionId, user_id: user!.id, user_name: profile?.full_name || user!.email || 'Professor', text });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('questions').update({ status: 'answered' }).eq('id', questionId);
      if (e2) throw e2;
    },
    onSuccess: (_d, v) => {
      setReply((r) => ({ ...r, [v.questionId]: '' }));
      queryClient.invalidateQueries({ queryKey: ['qa-questions'] });
    },
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('questions').update({ is_stuck_flag: false, status: 'answered' }).eq('id', id);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['qa-questions'] }),
  });

  if (coursesQ.isLoading || (courseIds.length > 0 && q.isLoading)) return <PageSkeleton />;
  const questions = q.data ?? [];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={100}>
      <Screen edges={[]} onRefresh={q.refetch}>
        <PageHeader title="Questions & Answers" />
        <SegmentedTabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: 'open', label: 'Open' },
            { value: 'answered', label: 'Answered' },
            { value: 'all', label: 'All' },
          ]}
        />
        {questions.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No questions" description={filter === 'open' ? 'No open questions from students.' : 'No questions found.'} />
        ) : (
          questions.map((item) => (
            <Card key={item.id} style={{ marginBottom: 12 }}>
              <Row style={{ alignItems: 'flex-start', gap: 12 }}>
                <IconBox icon={item.is_stuck_flag ? Flag : MessageSquare} color={item.is_stuck_flag ? C.orange500 : C.blue600} size={36} iconSize={16} radius={8} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: C.black }}>{item.text}</Text>
                  <Row style={{ marginTop: 6, flexWrap: 'wrap' }} gap={6}>
                    <Text style={{ fontSize: 12, color: C.gray400 }}>
                      {item.user_name || 'Student'} · {timeAgo(item.created_at)}
                    </Text>
                    {item.course_title ? <Badge label={item.course_title} bg={C.gray50} border={C.gray50} /> : null}
                    <Badge label={item.status} bg={item.status === 'answered' ? C.emerald50 : C.yellow50} color={item.status === 'answered' ? C.emerald700 : C.yellow700} border="transparent" />
                    {item.is_stuck_flag ? <Badge label="Stuck" bg={C.orange50} color={C.orange700} border="transparent" /> : null}
                  </Row>
                  {item.answers.map((a) => (
                    <View key={a.id} style={{ marginTop: 12, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: C.primary }}>
                      <Text style={{ fontSize: 14, color: C.gray700 }}>{a.text}</Text>
                      <Text style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>
                        {a.user_name} · {new Date(a.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  ))}
                </View>
              </Row>
              <Row style={{ marginTop: 12, alignItems: 'flex-end' }}>
                <View style={{ flex: 1 }}>
                  <Field placeholder="Write a reply..." value={reply[item.id] || ''} onChangeText={(t) => setReply((r) => ({ ...r, [item.id]: t }))} multiline style={{ minHeight: 48 }} />
                </View>
                <Button
                  icon={Send}
                  disabled={!reply[item.id]?.trim()}
                  loading={replyMutation.isPending && replyMutation.variables?.questionId === item.id}
                  onPress={() => (isOnline() ? replyMutation.mutate({ questionId: item.id, text: reply[item.id].trim() }) : Alert.alert('You’re offline', OFFLINE_MESSAGE))}
                  style={{ width: 48, height: 48, paddingHorizontal: 0 }}
                />
              </Row>
              {item.is_stuck_flag ? <Button title="Resolve" icon={CheckCircle} variant="success" size="sm" onPress={() => (isOnline() ? resolve.mutate(item.id) : Alert.alert('You’re offline', OFFLINE_MESSAGE))} style={{ marginTop: 8, alignSelf: 'flex-start' }} /> : null}
            </Card>
          ))
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
