import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '@/components/ui';
import { C } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

/** Sends each user to their role's home, like the website's role-based "/" route. */
export default function Index() {
  const { profile, viewMode, refreshProfile, signOut } = useAuth();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (profile) return;
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [profile]);

  if (!profile) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, gap: 12, padding: 24 }}>
        <ActivityIndicator color={C.primary} />
        {slow ? (
          <>
            <Text style={{ color: C.gray500, textAlign: 'center' }}>We couldn't load your profile. Check your connection and try again.</Text>
            <Button title="Retry" onPress={refreshProfile} />
            <Button title="Sign out" variant="ghost" onPress={signOut} />
          </>
        ) : null}
      </View>
    );
  }
  if (profile.role === 'admin' && viewMode === 'professor') return <Redirect href="/admin" />;
  if (profile.role === 'professor' && viewMode === 'professor') return <Redirect href="/professor" />;
  return <Redirect href="/student" />;
}
