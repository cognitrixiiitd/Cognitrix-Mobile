import * as Haptics from 'expo-haptics';
import { CheckCircle, CloudOff, HelpCircle, Trophy, XCircle } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { C, R } from '@/constants/theme';
import { emitAchievement } from '@/lib/events';
import { isAnswerCorrect, submitQuiz, type QuizAnswers } from '@/lib/progress';
import type { Quiz } from '@/lib/types';

import { Button, Card, Field, Row } from './ui';

export default function QuizModule({ quiz, userId }: { quiz: Quiz; userId: string }) {
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [queued, setQueued] = useState(false);
  const [points, setPoints] = useState<number | null>(null);

  if (!quiz?.questions?.length) return null;

  const set = (i: number, v: number | string) => {
    if (submitted) return;
    setAnswers((prev) => ({ ...prev, [i]: v }));
  };

  // Short-answer-only quizzes can't be auto-graded (same rule as the website).
  const gradable = quiz.questions.some((q) => q.question_type !== 'short_answer');

  const allAnswered = quiz.questions.every((q, i) => {
    if (q.question_type === 'short_answer') return true;
    if (q.question_type === 'fill_in_blank') return String(answers[i] ?? '').trim().length > 0;
    return answers[i] !== undefined;
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await submitQuiz({ quiz, answers, userId });
      setScore(res.score);
      setPoints(res.points);
      setQueued(res.queued);
      setSubmitted(true);
      Haptics.notificationAsync(res.score >= 70 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
      emitAchievement(res.achievement);
    } catch (err: any) {
      Alert.alert('Could not submit quiz', err?.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const good = (score ?? 0) >= 70;

  return (
    <Card style={{ padding: 20 }}>
      <Row style={{ marginBottom: 16 }}>
        <HelpCircle size={20} color={C.primary} />
        <Text style={styles.title}>{quiz.title || 'Quiz'}</Text>
      </Row>

      {submitted ? (
        <View style={[styles.result, good ? { backgroundColor: C.emerald50, borderColor: C.emerald200 } : { backgroundColor: C.orange50, borderColor: C.orange200 }]}>
          <Row gap={6}>
            {good ? <Trophy size={16} color={C.emerald600} /> : null}
            <Text style={{ fontSize: 14, fontWeight: '600', color: good ? C.emerald700 : C.orange700 }}>Score: {score}%</Text>
          </Row>
          <Text style={{ fontSize: 12, color: C.gray600, marginTop: 4 }}>
            {points === 0
              ? "You've already completed this quiz — retakes are for practice and don't earn points."
              : score === 100
                ? '🎉 Perfect! 60 pts earned (includes +10 bonus)!'
                : `✅ Good job! ${points ?? 10 + Math.round(40 * ((score ?? 0) / 100))} pts earned.`}
          </Text>
          {queued ? (
            <Row gap={6} style={{ marginTop: 8 }}>
              <CloudOff size={13} color={C.gray500} />
              <Text style={{ fontSize: 12, color: C.gray500, flex: 1 }}>Saved on your phone — your score and points will sync when you're back online.</Text>
            </Row>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 20 }}>
        {quiz.questions.map((q, qIdx) => (
          <View key={q.id ?? qIdx}>
            <Text style={styles.question}>
              {qIdx + 1}. {q.question_text}
            </Text>

            {!q.question_type || q.question_type === 'multiple_choice' ? (
              <View style={{ gap: 6 }}>
                {(q.choices || []).map((choice, cIdx) => {
                  const selected = answers[qIdx] === cIdx;
                  const correct = submitted && cIdx === q.correct_index;
                  const wrong = submitted && selected && cIdx !== q.correct_index;
                  return (
                    <Pressable
                      key={cIdx}
                      disabled={submitted}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        set(qIdx, cIdx);
                      }}
                      style={[
                        styles.choice,
                        correct ? styles.choiceCorrect : wrong ? styles.choiceWrong : selected ? styles.choiceSelected : null,
                      ]}>
                      {correct ? <CheckCircle size={16} color={C.emerald700} /> : null}
                      {wrong ? <XCircle size={16} color={C.red700} /> : null}
                      {!submitted ? <View style={[styles.radio, selected && { borderColor: C.primary, backgroundColor: C.primary }]} /> : null}
                      <Text style={[styles.choiceText, correct ? { color: C.emerald700 } : wrong ? { color: C.red700 } : selected ? { color: C.primary } : null]}>{choice}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {q.question_type === 'fill_in_blank' ? (
              <View>
                <Field
                  placeholder="Type your answer..."
                  value={String(answers[qIdx] ?? '')}
                  onChangeText={(t) => set(qIdx, t)}
                  editable={!submitted}
                  autoCapitalize="none"
                  style={submitted ? (isAnswerCorrect(q, answers[qIdx]) ? { borderColor: '#6ee7b7', backgroundColor: C.emerald50 } : { borderColor: '#fca5a5', backgroundColor: C.red50 }) : undefined}
                />
                {submitted ? (
                  <Text style={{ fontSize: 12, marginTop: 4, color: isAnswerCorrect(q, answers[qIdx]) ? C.emerald600 : C.red600 }}>
                    {isAnswerCorrect(q, answers[qIdx]) ? '✓ Correct!' : `✗ Correct answer: ${q.correct_answer}`}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {q.question_type === 'short_answer' ? (
              <View>
                <Field placeholder="Write your answer..." value={String(answers[qIdx] ?? '')} onChangeText={(t) => set(qIdx, t)} editable={!submitted} multiline />
                {submitted ? <Text style={{ fontSize: 12, color: C.gray500, marginTop: 4 }}>Your response has been recorded. This will be reviewed manually.</Text> : null}
              </View>
            ) : null}
          </View>
        ))}
      </View>

      {!submitted ? <Button title="Submit Quiz" onPress={handleSubmit} disabled={!allAnswered || !gradable} loading={submitting} style={{ marginTop: 20, alignSelf: 'flex-start' }} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '600', color: C.black, flex: 1 },
  result: { padding: 14, borderRadius: R.md, borderWidth: 1, marginBottom: 18 },
  question: { fontSize: 14, fontWeight: '500', color: C.black, marginBottom: 8, lineHeight: 20 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: R.md, backgroundColor: C.gray50, borderWidth: 1, borderColor: 'transparent' },
  choiceSelected: { backgroundColor: C.primary10, borderColor: C.primary30 },
  choiceCorrect: { backgroundColor: C.emerald50, borderColor: C.emerald200 },
  choiceWrong: { backgroundColor: C.red50, borderColor: C.red200 },
  choiceText: { fontSize: 14, color: C.gray700, flex: 1 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.gray300 },
});
