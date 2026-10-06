import { Tabs } from 'expo-router';
import { BarChart3, BookOpen, GraduationCap, LayoutDashboard, MessageSquare } from 'lucide-react-native';

import AppHeader from '@/components/AppHeader';
import { C } from '@/constants/theme';

// Mirrors the website's studentNav: Dashboard, Browse Courses, My Learning, Achievements, Q&A.
export default function StudentTabs() {
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
      <Tabs.Screen name="catalog" options={{ title: 'Browse', tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size - 2} /> }} />
      <Tabs.Screen name="learning" options={{ title: 'My Learning', tabBarIcon: ({ color, size }) => <GraduationCap color={color} size={size - 2} /> }} />
      <Tabs.Screen name="achievements" options={{ title: 'Achievements', tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size - 2} /> }} />
      <Tabs.Screen name="qa" options={{ title: 'Q&A', tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size - 2} /> }} />
    </Tabs>
  );
}
