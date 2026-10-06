import { router } from 'expo-router';
import { GraduationCap } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card, Field, Screen } from '@/components/ui';
import { C, R } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async () => {
    setError('');
    setMessage('');
    if (!email || !password || (isSignUp && !fullName)) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password, fullName);
        setMessage('Account created! Check your email to confirm, then sign in.');
        setIsSignUp(false);
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']} contentStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.logo}>
            <GraduationCap size={32} color={C.primary} />
          </View>
          <Text style={styles.brand}>Cognitrix</Text>
          <Text style={styles.sub}>{isSignUp ? 'Create your account' : 'Sign in to your account'}</Text>
        </View>

        <Card style={styles.card}>
          <View style={{ gap: 16 }}>
            {isSignUp ? <Field label="Full Name" value={fullName} onChangeText={setFullName} placeholder="John Doe" autoComplete="name" /> : null}
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@university.edu" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry autoComplete={isSignUp ? 'new-password' : 'current-password'} onSubmitEditing={handleSubmit} />

            {error ? <Text style={[styles.alert, { color: C.red600, backgroundColor: C.red50 }]}>{error}</Text> : null}
            {message ? <Text style={[styles.alert, { color: C.emerald600, backgroundColor: C.emerald50 }]}>{message}</Text> : null}

            <Button title={loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'} onPress={handleSubmit} loading={loading} full />
          </View>

          <View style={{ marginTop: 24, alignItems: 'center', gap: 12 }}>
            <Pressable
              onPress={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setMessage('');
              }}>
              <Text style={styles.link}>{isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}</Text>
            </Pressable>
            {!isSignUp ? (
              <Pressable onPress={() => router.push('/professor-signup')}>
                <Text style={[styles.link, { color: C.gray500 }]}>Apply as Professor →</Text>
              </Pressable>
            ) : null}
          </View>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 64, height: 64, borderRadius: R.lg, backgroundColor: C.primary10, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  brand: { fontSize: 24, fontWeight: '700', color: C.gray900 },
  sub: { fontSize: 15, color: C.gray500, marginTop: 4 },
  card: { padding: 24, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  alert: { fontSize: 14, padding: 12, borderRadius: R.md, overflow: 'hidden' },
  link: { fontSize: 14, color: C.primary },
});
