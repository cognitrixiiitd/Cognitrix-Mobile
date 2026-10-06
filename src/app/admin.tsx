import { router } from 'expo-router';
import { GraduationCap, Monitor, Shield } from 'lucide-react-native';
import { Text } from 'react-native';

import AppHeader from '@/components/AppHeader';
import { Banner, Button, Card, IconBox, Screen } from '@/components/ui';
import { C } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

/** The admin console (applications, user management) stays on the website. */
export default function AdminHome() {
  const { setViewMode, signOut } = useAuth();
  return (
    <>
      <AppHeader />
      <Screen edges={[]}>
        <Card style={{ alignItems: 'center', padding: 24, marginBottom: 16 }}>
          <IconBox icon={Shield} size={56} iconSize={28} />
          <Text style={{ fontSize: 20, fontWeight: '600', marginTop: 14 }}>Admin Account</Text>
          <Text style={{ fontSize: 14, color: C.gray500, textAlign: 'center', marginTop: 6 }}>Professor applications, user management and platform settings are available in the Admin Dashboard on the website.</Text>
        </Card>
        <Banner tone="blue" icon={Monitor} title="Use the website for admin tasks" description="Everything you change there is reflected in the app immediately." />
        <Button
          title="Open Student View"
          icon={GraduationCap}
          onPress={() => {
            setViewMode('student');
            router.replace('/student');
          }}
          style={{ marginTop: 16 }}
        />
        <Button title="Sign Out" variant="danger" onPress={signOut} style={{ marginTop: 10 }} />
      </Screen>
    </>
  );
}
