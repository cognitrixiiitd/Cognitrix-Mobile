import { Tabs } from 'expo-router';
import { BookOpen, LayoutDashboard, MessageSquare } from 'lucide-react-native';

import AppHeader from '@/components/AppHeader';
import { C } from '@/constants/theme';

// Mobile subset of the website's professorNav. Course creation/editing and analytics
// stay on the website, which has the space for those editors.
export default function ProfessorTabs() {
  return (
    <Tabs
      screenOptions={{
        header: () => <AppHeader />,
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.gray400,
        tabBarStyle: { backgroundColor: C.white, borderTopColor: C.gray100 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        sceneStyle: { backgroundColor: C.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size - 2} /> }} />
      <Tabs.Screen name="courses" options={{ title: 'My Courses', tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size - 2} /> }} />
      <Tabs.Screen name="qa" options={{ title: 'Q&A', tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size - 2} /> }} />
    </Tabs>
  );
}
