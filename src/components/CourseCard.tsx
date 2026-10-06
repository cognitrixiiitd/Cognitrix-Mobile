import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { BookOpen, Clock, Users, Video } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { C } from '@/constants/theme';
import { categoryLabels } from '@/lib/format';
import type { Course } from '@/lib/types';

import { Badge, Card, ProgressBar, Row } from './ui';

export function CourseThumb({ uri, height = 160, iconSize = 48 }: { uri?: string | null; height?: number; iconSize?: number }) {
  return (
    <LinearGradient colors={['rgba(0,169,141,0.20)', 'rgba(0,169,141,0.10)', '#ffffff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : <BookOpen size={iconSize} color="rgba(0,169,141,0.3)" />}
    </LinearGradient>
  );
}

export default function CourseCard({ course, href, duration, progress, showStatus }: {
  course: Course;
  href?: Href;
  duration?: number;
  progress?: number | null;
  showStatus?: boolean;
}) {
  const statusColors =
    course.status === 'published'
      ? { bg: C.emerald100, fg: C.emerald700 }
      : course.status === 'draft'
        ? { bg: C.amber100, fg: C.yellow700 }
        : { bg: C.gray100, fg: C.gray600 };

  return (
    <Card style={styles.card} onPress={() => router.push(href ?? (`/course/${course.id}` as Href))}>
      <View>
        <CourseThumb uri={course.thumbnail_url} />
        {showStatus && course.status ? (
          <Badge label={course.status} bg={statusColors.bg} color={statusColors.fg} border={statusColors.bg} style={{ position: 'absolute', top: 12, right: 12 }} />
        ) : null}
      </View>
      <View style={{ padding: 16 }}>
        {course.category ? <Badge label={categoryLabels[course.category] || course.category} style={{ marginBottom: 8 }} /> : null}
        <Text style={styles.title} numberOfLines={2}>
          {course.title}
        </Text>
        {course.short_description ? (
          <Text style={styles.desc} numberOfLines={2}>
            {course.short_description}
          </Text>
        ) : null}

        {progress != null ? (
          <View style={{ marginTop: 12 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={styles.meta}>{Math.round(progress)}% complete</Text>
              {course.professor_name ? <Text style={styles.meta}>{course.professor_name}</Text> : null}
            </Row>
            <ProgressBar value={progress} />
          </View>
        ) : (
          <Row gap={14} style={{ marginTop: 14 }}>
            {duration && duration > 0 ? (
              <Row gap={4}>
                <Video size={14} color={C.gray400} />
                <Text style={styles.meta}>
                  {Math.floor(duration / 60)}h {Math.round(duration % 60)}m
                </Text>
              </Row>
            ) : course.estimated_hours ? (
              <Row gap={4}>
                <Clock size={14} color={C.gray400} />
                <Text style={styles.meta}>{course.estimated_hours}h</Text>
              </Row>
            ) : null}
            {course.enrollment_count ? (
              <Row gap={4}>
                <Users size={14} color={C.gray400} />
                <Text style={styles.meta}>{course.enrollment_count}</Text>
              </Row>
            ) : null}
            {course.professor_name ? (
              <Text style={[styles.meta, { marginLeft: 'auto', color: C.gray500 }]} numberOfLines={1}>
                {course.professor_name}
              </Text>
            ) : null}
          </Row>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, overflow: 'hidden', marginBottom: 14 },
  title: { fontSize: 16, fontWeight: '600', color: C.black, lineHeight: 21 },
  desc: { fontSize: 14, color: C.gray500, marginTop: 6, lineHeight: 19 },
  meta: { fontSize: 12, color: C.gray400 },
});
