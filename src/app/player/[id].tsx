import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  Bookmark,
  Bot,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  CloudOff,
  Download,
  ExternalLink,
  FileText,
  HardDriveDownload,
  Lock,
  Play,
  Plus,
  Send,
  Sparkles,
  StickyNote,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { typeIcons } from '@/components/lectureIcons';
import NativeVideo from '@/components/NativeVideo';
import OfflineBanner from '@/components/OfflineBanner';
import QuizModule from '@/components/QuizModule';
import { Badge, BottomSheet, Button, Card, Field, ProgressBar, Row, SegmentedTabs, Skeleton } from '@/components/ui';
import YouTubePlayer, { type PlayerHandle } from '@/components/YouTubePlayer';
import { C, R } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { openDocument } from '@/lib/documents';
import { cancel, downloadAll, downloadTargets, formatBytes, getDownload, localVideoUri, remove, useDownloadIndex, useDownloadState, type DownloadTarget } from '@/lib/downloads';
import { emitAchievement } from '@/lib/events';
import { formatTime, getYouTubeId, timeAgo } from '@/lib/format';
import { fetchCourseLectures, startSecondsFromUrl } from '@/lib/lectures';
import { OFFLINE_MESSAGE, useIsOnline } from '@/lib/network';
import { addBookmark, addWatchTime, askQuestion, completeLecture, deleteBookmark, ensureStudentStats, logEvent } from '@/lib/progress';
import { supabase } from '@/lib/supabase';
import type { Course, Enrollment, Lecture, Quiz } from '@/lib/types';

type Tab = 'overview' | 'lectures' | 'notes' | 'qa';

export default function CoursePlayer() {
  const params = useLocalSearchParams<{ id: string; lecture?: string; t?: string; qa?: string }>();
  const courseId = params.id;
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const online = useIsOnline();
  useDownloadIndex(); // switch to the local copy as soon as a download finishes

  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<Tab>(params.qa ? 'qa' : 'overview');
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [startAt, setStartAt] = useState<number | null>(params.t ? parseInt(params.t, 10) || 0 : null);
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [savedOffline, setSavedOffline] = useState<string | null>(null);
  const playerRef = useRef<PlayerHandle>(null);
  const watchStartRef = useRef<number>(Date.now());
  const lastTimeRef = useRef(0);

  const courseQ = useQuery({
    queryKey: ['player-course', courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from('courses').select('id, title, enrollment_count').eq('id', courseId).single();
      if (error) throw error;
      return data as Course;
    },
    enabled: !!courseId,
  });

  const lecturesQ = useQuery({
    queryKey: ['player-lectures', courseId],
    queryFn: () => fetchCourseLectures(courseId),
    enabled: !!courseId,
  });
  const lectures = useMemo(() => lecturesQ.data ?? [], [lecturesQ.data]);

  const enrollmentQ = useQuery({
    queryKey: ['player-enrollment', courseId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('id, course_id, student_id, completed_lectures, progress_percent, time_spent_minutes, status, completed_at')
        .eq('course_id', courseId)
        .eq('student_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as Enrollment | null;
    },
    enabled: !!courseId && !!user,
  });
  const enrollment = enrollmentQ.data;

  const quizzesQ = useQuery({
    queryKey: ['player-quizzes', courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from('quizzes').select('*, quiz_questions(*)').eq('course_id', courseId);
      if (error) throw error;
      return (data || []).map((q: any) => ({
        ...q,
        questions: [...(q.quiz_questions || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
      })) as Quiz[];
    },
    enabled: !!courseId,
  });

  useEffect(() => {
    if (user && profile?.role === 'student' && online) ensureStudentStats(user.id);
  }, [user, profile?.role, online]);

  // Jump to the lecture requested via ?lecture= (bookmarks, notifications).
  useEffect(() => {
    if (!params.lecture || lectures.length === 0) return;
    const i = lectures.findIndex((l) => l.id === params.lecture);
    if (i >= 0) setIndex(i);
  }, [params.lecture, lectures]);

  // Same self-healing as the website: un-complete a course if new lectures were added.
  useEffect(() => {
    if (!online || !enrollment || !lectures.length) return;
    const done = enrollment.completed_lectures?.length || 0;
    if (enrollment.status === 'completed' && done < lectures.length) {
      supabase
        .from('enrollments')
        .update({ status: 'active', progress_percent: Math.min(100, Math.round((done / lectures.length) * 100)), completed_at: null })
        .eq('id', enrollment.id)
        .then(({ error }) => {
          if (!error) queryClient.invalidateQueries({ queryKey: ['player-enrollment', courseId, user?.id] });
        });
    }
  }, [enrollment, lectures, courseId, user?.id, queryClient, online]);

  /* ── Watch time: flushed every minute, on lecture change and when backgrounded (queued offline) ── */
  const hasEnrollment = !!enrollment;
  const flushWatchTime = useCallback(() => {
    const minutes = Math.round((Date.now() - watchStartRef.current) / 60000);
    if (!user || !hasEnrollment || minutes < 1) return;
    watchStartRef.current = Date.now();
    addWatchTime(user.id, courseId, minutes);
  }, [user, hasEnrollment, courseId]);

  useEffect(() => {
    const interval = setInterval(flushWatchTime, 60_000);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') watchStartRef.current = Date.now();
      else flushWatchTime();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
      flushWatchTime();
    };
  }, [flushWatchTime]);

  const lecture = lectures[index];

  useEffect(() => {
    watchStartRef.current = Date.now();
    setJustCompletedId(null);
    setSavedOffline(null);
    setCurrentTime(0);
    setVideoDuration(0);
    lastTimeRef.current = 0;
  }, [index]);

  const goTo = (i: number) => {
    if (i === index || i < 0 || i >= lectures.length) return;
    flushWatchTime();
    setStartAt(null);
    setIndex(i);
    setTab('overview');
  };

  const onTime = useCallback(
    (time: number, duration: number) => {
      // Rewinds > 3s are logged as possible confusion, same as the web player.
      if (user && lecture && Math.abs(time - lastTimeRef.current) > 5 && time < lastTimeRef.current - 3) {
        logEvent({
          user_id: user.id,
          course_id: courseId,
          lecture_id: lecture.id,
          event_type: 'pause',
          timestamp_seconds: time,
          meta: { seek_from: lastTimeRef.current, seek_to: time, replay_seconds: Math.abs(time - lastTimeRef.current), possible_confusion: true },
        });
      }
      lastTimeRef.current = time;
      setCurrentTime(time);
      if (duration > 0) setVideoDuration(duration);
    },
    [user, lecture, courseId],
  );

  const handleComplete = async () => {
    if (!user || !enrollment || !lecture) return;
    setCompleting(true);
    setJustCompletedId(lecture.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    try {
      const res = await completeLecture({
        userId: user.id,
        courseId,
        lectureId: lecture.id,
        totalLectures: lectures.length,
        watchSeconds: Math.round((Date.now() - watchStartRef.current) / 1000),
        currentTime,
        videoDuration,
      });
      watchStartRef.current = Date.now();
      if (res.queued) setSavedOffline(lecture.id);
      emitAchievement(res.achievement);
    } catch (err: any) {
      setJustCompletedId(null);
      Alert.alert('Could not mark complete', err?.message ?? 'Please try again.');
    } finally {
      setCompleting(false);
    }
  };

  const seekTo = (secs: number) => {
    playerRef.current?.seekTo(secs);
    setCurrentTime(secs);
  };

  const openTutor = () => {
    if (!online) return Alert.alert('AI Tutor needs internet', OFFLINE_MESSAGE);
    router.push({ pathname: '/tutor', params: { lectureId: lecture?.id ?? '' } });
  };

  if ((courseQ.isLoading || lecturesQ.isLoading) && !courseQ.data) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={{ padding: 16, gap: 12 }}>
          <Skeleton height={20} width="50%" />
          <Skeleton height={210} radius={R.lg} />
          <Skeleton height={24} width="70%" />
          <Skeleton height={120} radius={R.lg} />
        </View>
      </SafeAreaView>
    );
  }

  const course = courseQ.data;
  if (!course) {
    return (
      <SafeAreaView style={[styles.root, { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }]}>
        {!online ? <WifiOff size={28} color={C.gray300} /> : null}
        <Text style={{ color: C.gray500, textAlign: 'center' }}>{online ? 'Course not found' : "This course hasn't been opened on this phone yet, so it isn't available offline."}</Text>
        <Button title="Go back" variant="ghost" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const isCompleted = !!lecture && (enrollment?.completed_lectures?.includes(lecture.id) || justCompletedId === lecture.id);
  const quiz = quizzesQ.data?.find((q) => q.lecture_id === lecture?.id);
  const ytId = lecture?.type === 'youtube' ? getYouTubeId(lecture.source_url) : null;
  const localVideo = lecture ? localVideoUri(lecture.id) : null;
  const segmentStart = startSecondsFromUrl(lecture?.source_url);
  const start = startAt ?? segmentStart;
  const isVideoLecture = lecture?.type === 'youtube' || lecture?.type === 'video';
  const allTargets = lectures.flatMap((l) => downloadTargets(l, course));

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topbar}>
        <Pressable hitSlop={10} onPress={() => (router.canGoBack() ? router.back() : router.replace(`/course/${courseId}`))} style={styles.back}>
          <ArrowLeft size={18} color={C.gray500} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.courseTitle} numberOfLines={1}>
            {course.title}
          </Text>
          <Text style={styles.courseSub}>
            {lectures.length ? `${index + 1} of ${lectures.length} lectures` : 'No lectures'}
            {enrollment ? ` · ${enrollment.progress_percent || 0}% complete` : ''}
          </Text>
        </View>
        <Pressable onPress={openTutor} style={[styles.tutorBtn, !online && { opacity: 0.45 }]}>
          <Sparkles size={14} color={C.white} />
          <Text style={{ color: C.white, fontSize: 12, fontWeight: '600' }}>AI Tutor</Text>
        </Pressable>
      </View>
      <OfflineBanner />

      {!lecture ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.gray400 }}>No lectures available</Text>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Media stays pinned while the details scroll underneath. */}
          <View style={styles.media}>
            {isVideoLecture && localVideo ? (
              // A downloaded copy always plays in-app — offline, and online too (no data used).
              <View>
                <NativeVideo key={`${lecture.id}-local`} ref={playerRef} uri={localVideo} start={start} onTime={onTime} />
                <View style={styles.offlinePill}>
                  <HardDriveDownload size={11} color={C.white} />
                  <Text style={{ color: C.white, fontSize: 10, fontWeight: '600' }}>Downloaded</Text>
                </View>
              </View>
            ) : isVideoLecture && !online ? (
              <OfflineVideoCard downloadable={downloadTargets(lecture, course).some((t) => t.kind === 'video')} />
            ) : lecture.type === 'youtube' && ytId ? (
              <YouTubePlayer ref={playerRef} videoId={ytId} start={start} onTime={onTime} />
            ) : lecture.type === 'video' && lecture.source_url ? (
              <NativeVideo key={lecture.id} ref={playerRef} uri={lecture.source_url} start={start} onTime={onTime} />
            ) : (
              <DocumentCard lecture={lecture} />
            )}
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            <SegmentedTabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'overview', label: 'Overview' },
                { value: 'lectures', label: `Lectures (${lectures.length})` },
                { value: 'notes', label: 'Notes' },
                { value: 'qa', label: 'Q&A' },
              ]}
            />

            {tab === 'overview' ? (
              <View>
                <Text style={styles.lectureTitle}>{lecture.title}</Text>
                {lecture.ai_generated_description ? <Text style={styles.desc}>{lecture.ai_generated_description}</Text> : null}

                {videoDuration > 0 ? (
                  <View style={{ marginTop: 12 }}>
                    <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={styles.small}>Progress: {Math.round((currentTime / videoDuration) * 100)}%</Text>
                      <Text style={styles.small}>
                        {formatTime(currentTime)} / {formatTime(videoDuration)}
                      </Text>
                    </Row>
                    <ProgressBar value={(currentTime / videoDuration) * 100} />
                  </View>
                ) : null}

                {lecture.topic_timestamps?.length ? (
                  <View style={{ marginTop: 16 }}>
                    <Row gap={4} style={{ marginBottom: 8 }}>
                      <Clock size={12} color={C.gray500} />
                      <Text style={[styles.small, { fontWeight: '500' }]}>Topic Timestamps</Text>
                    </Row>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {lecture.topic_timestamps.map((ts, i) => (
                        <Pressable key={i} onPress={() => seekTo(ts.start_seconds ?? 0)} style={({ pressed }) => [styles.chip, pressed && { backgroundColor: C.primary10, borderColor: C.primary30 }]}>
                          <Text style={styles.chipTime}>{formatTime(ts.start_seconds ?? 0)}</Text>
                          <Text style={{ fontSize: 12, color: C.gray700 }}>{ts.label || ts.topic || `Segment ${i + 1}`}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ) : null}

                <Row style={{ marginTop: 16, flexWrap: 'wrap' }}>
                  {user ? <BookmarkButton userId={user.id} courseId={courseId} courseTitle={course.title} lecture={lecture} currentTime={currentTime} /> : null}
                  {enrollment ? (
                    <Button
                      title={isCompleted ? 'Completed' : 'Mark Complete'}
                      icon={CheckCircle}
                      variant={isCompleted ? 'success' : 'primary'}
                      disabled={isCompleted || completing}
                      loading={completing}
                      onPress={handleComplete}
                      style={{ flex: 1 }}
                    />
                  ) : null}
                </Row>
                {savedOffline === lecture.id ? (
                  <Row gap={6} style={{ marginTop: 8 }}>
                    <CloudOff size={13} color={C.gray500} />
                    <Text style={{ fontSize: 12, color: C.gray500 }}>Saved on your phone — progress and points will sync when you're online.</Text>
                  </Row>
                ) : null}

                <LectureDownload lecture={lecture} course={course} />

                <Transcript text={lecture.transcript_text} />

                {lecture.suggested_resources?.length ? (
                  <View style={[styles.box, { backgroundColor: C.blue50, borderColor: C.blue100 }]}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: C.blue900, marginBottom: 8 }}>📚 Recommended Resources</Text>
                    {lecture.suggested_resources.map((r, i) => (
                      <Pressable key={i} onPress={() => openDocument({ title: r.title || 'Resource', remoteUrl: r.url })} style={{ marginBottom: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: '500', color: C.blue700 }}>{r.title || r.url}</Text>
                        {r.description ? <Text style={{ fontSize: 12, color: C.blue600 }}>{r.description}</Text> : null}
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {lecture.attachments?.length ? (
                  <View style={[styles.box, { backgroundColor: C.gray50, borderColor: C.gray200 }]}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: C.gray700, marginBottom: 8 }}>📎 Attachments</Text>
                    {lecture.attachments.map((a, i) => {
                      const local = getDownload(`${lecture.id}:att:${i}`);
                      return (
                        <Pressable key={i} onPress={() => openDocument({ title: a.name || 'Attachment', remoteUrl: a.url, localUri: local?.fileUri })} style={styles.attachment}>
                          <FileText size={16} color={C.gray400} />
                          <Text style={{ fontSize: 14, color: C.gray700, flex: 1 }} numberOfLines={1}>
                            {a.name || 'Attachment'}
                          </Text>
                          {local ? <HardDriveDownload size={14} color={C.primary} /> : <ExternalLink size={14} color={C.gray400} />}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {quiz && isCompleted && user ? (
                  <View style={{ marginTop: 20 }}>
                    <QuizModule key={quiz.id} quiz={quiz} userId={user.id} />
                  </View>
                ) : null}
                {quiz && !isCompleted ? (
                  <View style={[styles.box, { backgroundColor: C.amber50, borderColor: C.amber200, alignItems: 'center', padding: 20, marginTop: 20 }]}>
                    <Lock size={18} color={C.amber700} />
                    <Text style={{ fontSize: 14, fontWeight: '500', color: C.amber800, marginTop: 6 }}>📝 Quiz available after completing this lecture</Text>
                    <Text style={{ fontSize: 12, color: C.amber600, marginTop: 4 }}>Mark the lecture as complete to unlock the quiz</Text>
                  </View>
                ) : null}

                <Row style={{ justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.gray100 }}>
                  <Button title="Previous" icon={ChevronLeft} variant="outline" disabled={index === 0} onPress={() => goTo(index - 1)} />
                  <Pressable disabled={index >= lectures.length - 1} onPress={() => goTo(index + 1)} style={({ pressed }) => [styles.nextBtn, index >= lectures.length - 1 && { opacity: 0.5 }, pressed && { backgroundColor: C.gray50 }]}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: C.gray700 }}>Next</Text>
                    <ChevronRight size={16} color={C.gray700} />
                  </Pressable>
                </Row>
              </View>
            ) : null}

            {tab === 'lectures' ? (
              <View>
                {allTargets.length > 0 ? <CourseDownload targets={allTargets} /> : null}
                <LectureList lectures={lectures} current={index} completed={enrollment?.completed_lectures || []} onSelect={goTo} online={online} />
              </View>
            ) : null}

            {tab === 'notes' && user ? (
              <NotesPanel userId={user.id} courseId={courseId} courseTitle={course.title} lecture={lecture} currentTime={currentTime} onSeek={seekTo} />
            ) : null}

            {tab === 'qa' && user ? (
              <QAPanel courseId={courseId} courseTitle={course.title} lectureId={lecture.id} userId={user.id} userName={profile?.full_name || user.email || 'Student'} onTutor={openTutor} />
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

/* ───────────── Media fallbacks ───────────── */

function OfflineVideoCard({ downloadable }: { downloadable: boolean }) {
  return (
    <View style={styles.docCard}>
      <WifiOff size={36} color={C.gray300} />
      <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray700, marginTop: 10 }}>Video not available offline</Text>
      <Text style={{ fontSize: 12, color: C.gray500, marginTop: 4, textAlign: 'center' }}>
        {downloadable ? 'Download this lecture next time you’re online to watch it anywhere.' : 'You can still read the transcript, review your notes and take the quiz below.'}
      </Text>
    </View>
  );
}

function DocumentCard({ lecture }: { lecture: Lecture }) {
  const Icon = typeIcons[lecture.type] || FileText;
  const local = getDownload(`${lecture.id}:document`);
  const label = lecture.type === 'external_link' ? 'This lecture links to an external resource' : lecture.type === 'notes' ? 'Lecture notes' : 'This lecture is a document';
  return (
    <View style={styles.docCard}>
      <Icon size={40} color={C.gray300} />
      <Text style={{ fontSize: 14, color: C.gray600, marginVertical: 12, textAlign: 'center' }}>{label}</Text>
      {lecture.source_url ? (
        <Button
          title={local ? 'Open Downloaded Copy' : lecture.type === 'external_link' ? 'Open Link' : 'Open Document'}
          icon={local ? HardDriveDownload : ExternalLink}
          onPress={() => openDocument({ title: lecture.title, remoteUrl: lecture.source_url, localUri: local?.fileUri })}
        />
      ) : (
        <Text style={{ fontSize: 12, color: C.gray400 }}>No URL provided</Text>
      )}
    </View>
  );
}

/* ───────────── Downloads ───────────── */

function LectureDownload({ lecture, course }: { lecture: Lecture; course: Course }) {
  const online = useIsOnline();
  const targets = downloadTargets(lecture, course);
  const keys = targets.map((t) => t.key);
  const state = useDownloadState(keys);

  if (targets.length === 0) {
    if (lecture.type === 'youtube' || lecture.type === 'video') {
      return (
        <Row gap={6} style={{ marginTop: 12 }}>
          <CloudOff size={13} color={C.gray400} />
          <Text style={{ fontSize: 12, color: C.gray400, flex: 1 }}>Your professor hasn't made this lecture available for offline viewing.</Text>
        </Row>
      );
    }
    return null;
  }

  const size = keys.reduce((s, k) => s + (getDownload(k)?.size ?? 0), 0);

  return (
    <View style={[styles.box, { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: state.complete ? C.primary5 : C.white, borderColor: state.complete ? C.primary20 : C.gray200 }]}>
      <View style={[styles.dlIcon, { backgroundColor: state.complete ? C.primary10 : C.gray50 }]}>
        {state.downloading ? <ActivityIndicator size="small" color={C.primary} /> : state.complete ? <HardDriveDownload size={18} color={C.primary} /> : <Download size={18} color={C.gray500} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: C.black }}>{state.complete ? 'Available offline' : state.downloading ? 'Downloading…' : 'Download for offline'}</Text>
        {state.downloading ? (
          <View style={{ marginTop: 6 }}>
            <ProgressBar value={state.progress * 100} height={4} />
          </View>
        ) : (
          <Text style={{ fontSize: 12, color: state.error ? C.red600 : C.gray500 }}>
            {state.error ? `Failed: ${state.error}` : state.complete ? `${formatBytes(size)} saved on this phone` : `${targets.length} file${targets.length > 1 ? 's' : ''}${targets.some((t) => t.kind === 'video') ? ' · includes video' : ''}`}
          </Text>
        )}
      </View>
      {state.downloading ? (
        <Button icon={X} variant="ghost" size="sm" onPress={() => cancel(keys)} />
      ) : state.complete ? (
        <Button
          icon={Trash2}
          variant="ghost"
          size="sm"
          onPress={() =>
            Alert.alert('Remove download?', 'You can download it again later.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => remove(keys) },
            ])
          }
        />
      ) : (
        <Button
          title="Download"
          size="sm"
          disabled={!online}
          onPress={() => downloadAll(targets.filter((t) => !getDownload(t.key)))}
        />
      )}
    </View>
  );
}

function CourseDownload({ targets }: { targets: DownloadTarget[] }) {
  const online = useIsOnline();
  const state = useDownloadState(targets.map((t) => t.key));
  return (
    <Card style={{ marginBottom: 12, padding: 14 }}>
      <Row style={{ gap: 12 }}>
        <View style={[styles.dlIcon, { backgroundColor: C.primary10 }]}>
          <HardDriveDownload size={18} color={C.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '600' }}>{state.complete ? 'Course available offline' : 'Download course'}</Text>
          <Text style={{ fontSize: 12, color: C.gray500 }}>
            {state.done} of {state.total} files saved
          </Text>
        </View>
        {state.downloading ? (
          <Button icon={X} variant="ghost" size="sm" onPress={() => cancel(targets.map((t) => t.key))} />
        ) : !state.complete ? (
          <Button title="Download all" size="sm" disabled={!online} onPress={() => downloadAll(targets.filter((t) => !getDownload(t.key)))} />
        ) : (
          <CheckCircle size={20} color={C.primary} />
        )}
      </Row>
      {state.downloading ? (
        <View style={{ marginTop: 10 }}>
          <ProgressBar value={state.progress * 100} height={4} />
        </View>
      ) : null}
    </Card>
  );
}

function Transcript({ text }: { text?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!text?.trim()) return null;
  return (
    <View style={[styles.box, { backgroundColor: C.white, borderColor: C.gray200 }]}>
      <Pressable onPress={() => setOpen(!open)}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row gap={6}>
            <FileText size={14} color={C.gray500} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray700 }}>Transcript</Text>
          </Row>
          {open ? <ChevronUp size={16} color={C.gray400} /> : <ChevronDown size={16} color={C.gray400} />}
        </Row>
      </Pressable>
      {open ? <Text style={{ fontSize: 13, color: C.gray600, lineHeight: 20, marginTop: 10 }}>{text}</Text> : null}
    </View>
  );
}

/* ───────────── Lecture list (web PlayerSidebar) ───────────── */

function LectureList({ lectures, current, completed, onSelect, online }: { lectures: Lecture[]; current: number; completed: string[]; onSelect: (i: number) => void; online: boolean }) {
  let lastSection: string | null | undefined;
  return (
    <View style={{ gap: 4 }}>
      {lectures.map((l, i) => {
        const Icon = typeIcons[l.type] || FileText;
        const done = completed.includes(l.id);
        const isCurrent = i === current;
        const downloaded = !!localVideoUri(l.id) || !!getDownload(`${l.id}:document`);
        const unavailable = !online && (l.type === 'youtube' || l.type === 'video') && !downloaded;
        const showSection = l.section_name && l.section_name !== lastSection;
        lastSection = l.section_name;
        return (
          <View key={l.id}>
            {showSection ? <Text style={styles.section}>{l.section_name}</Text> : null}
            <Pressable onPress={() => onSelect(i)} style={({ pressed }) => [styles.lectureRow, isCurrent && { backgroundColor: C.primary10 }, pressed && !isCurrent && { backgroundColor: C.gray50 }]}>
              <View style={[styles.lectureNum, { backgroundColor: done ? C.emerald50 : isCurrent ? C.primary20 : C.gray50 }]}>
                {done ? <CheckCircle size={14} color={C.emerald500} /> : <Text style={{ fontSize: 12, fontWeight: '500', color: C.gray400 }}>{i + 1}</Text>}
              </View>
              <View style={{ flex: 1, minWidth: 0, opacity: unavailable ? 0.5 : 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: isCurrent ? C.primary : C.black }} numberOfLines={2}>
                  {l.title}
                </Text>
                <Row gap={4}>
                  <Icon size={11} color={C.gray400} />
                  <Text style={{ fontSize: 11, color: C.gray400, textTransform: 'capitalize' }}>
                    {l.type?.replace('_', ' ')}
                    {l.duration_minutes ? ` · ${l.duration_minutes} min` : ''}
                    {unavailable ? ' · needs internet' : ''}
                  </Text>
                </Row>
              </View>
              {downloaded ? <HardDriveDownload size={14} color={C.primary} /> : null}
              {isCurrent ? <Play size={14} color={C.primary} /> : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/* ───────────── Bookmark (web BookmarkButton) — works offline ───────────── */

function BookmarkButton({ userId, courseId, courseTitle, lecture, currentTime }: { userId: string; courseId: string; courseTitle: string; lecture: Lecture; currentTime: number }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [atTime, setAtTime] = useState(0);

  const save = () => {
    setOpen(false);
    setSaved(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTimeout(() => setSaved(false), 2000);
    addBookmark({ userId, courseId, lectureId: lecture.id, timestampSeconds: atTime, note, lectureTitle: lecture.title, courseTitle }).catch((err) => {
      setSaved(false);
      Alert.alert('Bookmark not saved', err?.message ?? 'Please try again.');
    });
    setNote('');
  };

  return (
    <>
      <Button
        title={saved ? 'Saved!' : 'Bookmark'}
        icon={saved ? Check : Bookmark}
        variant={saved ? 'success' : 'outline'}
        onPress={() => {
          setAtTime(currentTime);
          setOpen(true);
        }}
      />
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Add Bookmark">
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 12 }}>
          <Text style={{ fontSize: 14, color: C.gray500 }}>Save this moment for later review. You can add an optional note.</Text>
          <Text style={{ fontSize: 14, color: C.gray600 }}>
            Timestamp: <Text style={{ fontWeight: '600', color: C.black }}>{formatTime(atTime)}</Text>
          </Text>
          <Field placeholder="Add a note (optional)..." value={note} onChangeText={setNote} multiline />
          <Row>
            <Button title="Cancel" variant="outline" onPress={() => setOpen(false)} style={{ flex: 1 }} />
            <Button title="Save Bookmark" onPress={save} style={{ flex: 1 }} />
          </Row>
        </View>
      </BottomSheet>
    </>
  );
}

/* ───────────── Notes (web VideoNotes — stored as bookmarks with a note) — works offline ───────────── */

function NotesPanel({ userId, courseId, courseTitle, lecture, currentTime, onSeek }: { userId: string; courseId: string; courseTitle: string; lecture: Lecture; currentTime: number; onSeek: (s: number) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [text, setText] = useState('');

  const notesQ = useQuery({
    queryKey: ['lecture-notes', lecture.id, userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('bookmarks').select('id, note, timestamp_seconds').eq('user_id', userId).eq('lecture_id', lecture.id).not('note', 'is', null).order('timestamp_seconds');
      if (error) throw error;
      return (data || []).filter((b) => b.note && b.note.trim());
    },
  });

  const save = () => {
    if (!text.trim()) return;
    addBookmark({ userId, courseId, lectureId: lecture.id, timestampSeconds: currentTime, note: text, lectureTitle: lecture.title, courseTitle }).catch((err) =>
      Alert.alert('Note not saved', err?.message ?? 'Please try again.'),
    );
    setText('');
    setShowForm(false);
  };

  const notes = notesQ.data ?? [];

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <Row gap={6}>
          <StickyNote size={16} color={C.gray500} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: C.black }}>My Notes</Text>
          <Badge label={String(notes.length)} bg={C.gray100} border={C.gray100} />
        </Row>
        <Button title={showForm ? 'Cancel' : 'Add Note'} icon={showForm ? X : Plus} variant="outline" size="sm" onPress={() => setShowForm(!showForm)} />
      </Row>
      {showForm ? (
        <View style={{ backgroundColor: C.gray50, padding: 12, borderRadius: R.sm, marginBottom: 14, gap: 8 }}>
          <Text style={{ fontSize: 12, color: C.gray500 }}>At {formatTime(currentTime)}</Text>
          <Field placeholder="Write your note..." value={text} onChangeText={setText} multiline />
          <Button title="Save Note" size="sm" disabled={!text.trim()} onPress={save} style={{ alignSelf: 'flex-start' }} />
        </View>
      ) : null}
      {notes.length === 0 ? (
        <Text style={{ fontSize: 12, color: C.gray400, textAlign: 'center', paddingVertical: 16 }}>No notes yet. Add your first note!</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {notes.map((n) => (
            <View key={n.id} style={{ backgroundColor: C.gray50, padding: 12, borderRadius: R.sm, flexDirection: 'row', gap: 8 }}>
              <Pressable style={{ flex: 1 }} onPress={() => onSeek(n.timestamp_seconds || 0)}>
                <Badge label={`▶ ${formatTime(n.timestamp_seconds)}`} color={C.primary} border={C.primary30} style={{ marginBottom: 4 }} />
                <Text style={{ fontSize: 14, color: C.gray700 }}>{n.note}</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => deleteBookmark(userId, n.id)}>
                <X size={14} color={C.gray400} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

/* ───────────── Q&A (web PlayerSidebar Q&A mode) — questions queue offline ───────────── */

function QAPanel({ courseId, courseTitle, lectureId, userId, userName, onTutor }: { courseId: string; courseTitle: string; lectureId: string; userId: string; userName: string; onTutor: () => void }) {
  const online = useIsOnline();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const q = useQuery({
    queryKey: ['lecture-questions', lectureId],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('questions')
        .select('id, text, user_name, question_answers(id, text, user_name, created_at), created_at')
        .eq('lecture_id', lectureId)
        .eq('is_stuck_flag', false)
        .order('created_at', { ascending: false });
      if (err) throw err;
      return (data || []).map((x: any) => ({ ...x, answers: x.question_answers || [] }));
    },
  });

  const ask = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError('');
    try {
      await askQuestion({ userId, userName, courseId, lectureId, text: t, courseTitle });
      setText('');
    } catch (err: any) {
      setError(err?.message ?? 'Could not post your question.');
    } finally {
      setSending(false);
    }
  };

  const questions = q.data ?? [];

  return (
    <View>
      <Text style={{ fontSize: 14, fontWeight: '600', color: C.black, marginBottom: 12 }}>Questions & Discussion</Text>

      <Pressable onPress={onTutor} style={[styles.aiCard, !online && { opacity: 0.5 }]}>
        <View style={styles.aiIcon}>
          <Bot size={16} color={C.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.white }}>Ask AI Tutor</Text>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>{online ? 'Get instant answers about this lecture' : 'Needs an internet connection'}</Text>
        </View>
        <Sparkles size={14} color="rgba(255,255,255,0.8)" />
      </Pressable>

      <Row style={{ alignItems: 'flex-end', marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Field placeholder={online ? 'Ask your professor a question...' : 'Ask a question — it will be posted when you reconnect'} value={text} onChangeText={setText} editable={!sending} multiline style={{ minHeight: 56 }} />
        </View>
        <Button icon={Send} onPress={ask} disabled={!text.trim()} loading={sending} style={{ height: 48, width: 48, paddingHorizontal: 0 }} />
      </Row>
      {error ? <Text style={{ fontSize: 12, color: C.red600, marginTop: -8, marginBottom: 12 }}>{error}</Text> : null}

      {questions.length === 0 ? (
        <Text style={{ fontSize: 12, color: C.gray400, textAlign: 'center', paddingVertical: 16 }}>No questions yet. Be the first!</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {questions.map((item: any) => (
            <View key={item.id} style={{ padding: 12, backgroundColor: C.white, borderRadius: R.md, borderWidth: 1, borderColor: item.pending ? C.gray200 : C.gray100, borderStyle: item.pending ? 'dashed' : 'solid' }}>
              <Text style={{ fontSize: 14, color: C.black }}>{item.text}</Text>
              <Text style={{ fontSize: 12, color: C.gray400, marginTop: 4 }}>
                {item.user_name} · {item.pending ? 'waiting to sync' : timeAgo(item.created_at)}
              </Text>
              {item.answers.map((a: any) => (
                <View key={a.id} style={{ marginTop: 8, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: C.primary }}>
                  <Text style={{ fontSize: 13, color: C.gray600 }}>{a.text}</Text>
                  <Text style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>{a.user_name}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  topbar: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  back: { padding: 6, borderRadius: R.sm },
  courseTitle: { fontSize: 14, fontWeight: '500', color: C.black },
  courseSub: { fontSize: 12, color: C.gray400 },
  tutorBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.violet, paddingHorizontal: 10, paddingVertical: 7, borderRadius: R.full },
  media: { padding: 12, paddingBottom: 0, backgroundColor: C.bg },
  offlinePill: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,169,141,0.9)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.full },
  lectureTitle: { fontSize: 18, fontWeight: '600', color: C.black },
  desc: { fontSize: 14, color: C.gray500, marginTop: 4, lineHeight: 20 },
  small: { fontSize: 12, color: C.gray500 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.sm, backgroundColor: C.gray50, borderWidth: 1, borderColor: C.gray200 },
  chipTime: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12, color: C.primary, fontWeight: '600' },
  box: { marginTop: 16, padding: 14, borderRadius: R.md, borderWidth: 1 },
  dlIcon: { width: 40, height: 40, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: C.white, borderRadius: R.sm, borderWidth: 1, borderColor: C.gray100, marginBottom: 6 },
  nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 18, borderRadius: R.md, borderWidth: 1, borderColor: C.gray200, backgroundColor: C.white },
  docCard: { aspectRatio: 16 / 9, borderRadius: R.lg, backgroundColor: C.gray100, borderWidth: 1, borderColor: C.gray200, alignItems: 'center', justifyContent: 'center', padding: 16 },
  section: { fontSize: 11, fontWeight: '600', color: C.gray500, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 12, marginBottom: 4, marginLeft: 4 },
  lectureRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: R.md },
  lectureNum: { width: 28, height: 28, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' },
  aiCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: R.md, marginBottom: 16, backgroundColor: C.primaryDark },
  aiIcon: { width: 32, height: 32, borderRadius: R.sm, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
});
