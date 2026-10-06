import { router } from 'expo-router';
import { ArrowLeft, CheckCircle2, GraduationCap } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Field, Row, Screen } from '@/components/ui';
import { C, R } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function ProfessorSignUp() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [f, setF] = useState({ fullName: '', email: '', department: '', designation: '', institution: '', coursesPlan: '', reason: '', password: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    setError('');
    if (!f.fullName || !f.email || !f.department || !f.designation || !f.institution || !f.coursesPlan) {
      setError('Please fill in all required fields.');
      return;
    }
    if (f.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const { error: insertError } = await supabase.from('professor_applications').insert({
        full_name: f.fullName.trim(),
        email: f.email.trim().toLowerCase(),
        department: f.department.trim(),
        designation: f.designation.trim(),
        institution: f.institution.trim(),
        courses_plan: f.coursesPlan.trim(),
        reason: f.reason.trim() || null,
        status: 'pending',
        password: f.password,
      });
      if (insertError) throw insertError;
      setSubmitted(true);
    } catch (err: any) {
      if (err?.code === '23505' || err?.message?.includes('duplicate key')) setError('An application with this email address already exists.');
      else setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Screen edges={['top', 'bottom']} contentStyle={{ flexGrow: 1, justifyContent: 'center', padding: 16 }}>
        <Card style={{ padding: 32, alignItems: 'center' }}>
          <View style={[styles.logo, { borderRadius: 32 }]}>
            <CheckCircle2 size={32} color={C.primary} />
          </View>
          <Text style={styles.title}>Application Submitted</Text>
          <Text style={styles.body}>Your application has been submitted successfully.</Text>
          <Text style={styles.body}>Our team will review your request and get back to you within 1 business day.</Text>
          <Text style={[styles.body, { marginTop: 8 }]}>
            For any queries, write to{' '}
            <Text style={{ color: C.primary, fontWeight: '500' }} onPress={() => Linking.openURL('mailto:cognitrix.iiitd@gmail.com')}>
              cognitrix.iiitd@gmail.com
            </Text>
          </Text>
          <Button title="Back to Sign In" variant="ghost" icon={ArrowLeft} onPress={() => router.back()} style={{ marginTop: 20 }} />
        </Card>
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <Pressable onPress={() => router.back()} style={{ marginBottom: 16 }}>
          <Row gap={6}>
            <ArrowLeft size={16} color={C.gray500} />
            <Text style={{ color: C.gray500, fontSize: 14 }}>Back to Sign In</Text>
          </Row>
        </Pressable>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={styles.logo}>
            <GraduationCap size={32} color={C.primary} />
          </View>
          <Text style={styles.title}>Apply as Professor</Text>
          <Text style={styles.body}>Submit your application to create courses on Cognitrix</Text>
        </View>
        <Card style={{ padding: 20 }}>
          <View style={{ gap: 14 }}>
            <Field label="Full Name *" value={f.fullName} onChangeText={set('fullName')} placeholder="Dr. Jane Smith" />
            <Field label="Institutional Email *" value={f.email} onChangeText={set('email')} placeholder="jane@university.edu" keyboardType="email-address" autoCapitalize="none" />
            <Field label="Password *" value={f.password} onChangeText={set('password')} placeholder="At least 6 characters" secureTextEntry />
            <Field label="Department *" value={f.department} onChangeText={set('department')} placeholder="Computer Science" />
            <Field label="Designation *" value={f.designation} onChangeText={set('designation')} placeholder="Assistant Professor" />
            <Field label="Institution *" value={f.institution} onChangeText={set('institution')} placeholder="IIIT Delhi" />
            <Field label="Courses you plan to teach *" value={f.coursesPlan} onChangeText={set('coursesPlan')} placeholder="e.g. Data Structures, Algorithms" multiline />
            <Field label="Why do you want to join? (optional)" value={f.reason} onChangeText={set('reason')} multiline />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Submit Application" onPress={handleSubmit} loading={loading} full />
          </View>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  logo: { width: 64, height: 64, borderRadius: R.lg, backgroundColor: C.primary10, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '600', color: C.gray900, marginBottom: 8 },
  body: { fontSize: 14, color: C.gray600, textAlign: 'center', lineHeight: 20 },
  error: { fontSize: 14, color: C.red600, backgroundColor: C.red50, padding: 12, borderRadius: R.md, overflow: 'hidden' },
});
