import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Bot, Send, Sparkles, Trash2, User, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C, R } from '@/constants/theme';
import { callGemini } from '@/lib/ai';
import { isOnline } from '@/lib/network';
import { supabase } from '@/lib/supabase';
import type { Lecture } from '@/lib/types';

type Msg = { role: 'user' | 'assistant'; text: string };
const MAX_MESSAGES = 40;

function welcome(lecture: Lecture | null | undefined, cleared = false): Msg {
  if (lecture) {
    return { role: 'assistant', text: cleared ? `Conversation cleared. Ask me anything about **${lecture.title}**.` : `Hi! I'm your AI tutor for **${lecture.title}**. Ask me anything about this lecture.` };
  }
  return { role: 'assistant', text: cleared ? 'Conversation cleared. How can I help you?' : "Hi! I'm your AI tutor. Ask me any educational question and I'll help you out." };
}

const storageKey = (lectureId?: string) => (lectureId ? `cognitrix-chat:lecture:${lectureId}` : 'cognitrix-chat:general');

function load(lectureId?: string): Msg[] | null {
  try {
    const raw = localStorage.getItem(storageKey(lectureId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

/** Renders **bold** segments, which is what the tutor mostly uses. */
function RichText({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={{ fontSize: 14, lineHeight: 20, color }}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <Text key={i} style={{ fontWeight: '700' }}>
            {p.slice(2, -2)}
          </Text>
        ) : (
          p.replace(/^\s*[*-]\s+/gm, '• ')
        ),
      )}
    </Text>
  );
}

export default function Tutor() {
  const { lectureId } = useLocalSearchParams<{ lectureId?: string }>();
  const id = lectureId || undefined;
  const scrollRef = useRef<ScrollView>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: lecture, isLoading } = useQuery({
    queryKey: ['tutor-lecture', id],
    queryFn: async () => {
      const { data } = await supabase.from('lectures').select('id, title, transcript_text, topic_timestamps').eq('id', id!).maybeSingle();
      return data as Lecture | null;
    },
    enabled: !!id,
  });

  const [messages, setMessages] = useState<Msg[]>(() => load(id) ?? []);
  useEffect(() => {
    if (messages.length === 0 && (!id || !isLoading)) setMessages([welcome(lecture)]);
  }, [lecture, isLoading, id, messages.length]);

  useEffect(() => {
    try {
      if (messages.length) localStorage.setItem(storageKey(id), JSON.stringify(messages.slice(-MAX_MESSAGES)));
    } catch {
      // chat still works in memory
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [messages, id]);

  const buildPrompt = (question: string) => {
    const ctx = lecture
      ? `You are an AI tutor helping a student understand the following lecture.\n\nLecture Title: ${lecture.title}\n${
          lecture.transcript_text ? `Transcript excerpt:\n${lecture.transcript_text.slice(0, 3000)}` : ''
        }${lecture.topic_timestamps?.length ? `\nTopics covered: ${lecture.topic_timestamps.map((t) => t.label || t.topic).join(', ')}` : ''}\n\nAnswer the following student question in a clear, concise, educational manner:`
      : 'You are a helpful AI tutor. Answer the following educational question clearly and concisely:';
    return `${ctx}\n\n${question}`;
  };

  const send = async () => {
    const t = input.trim();
    if (!t || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text: t }]);
    setInput('');
    if (!isOnline()) {
      setMessages((prev) => [...prev, { role: 'assistant', text: "You're offline right now. I need an internet connection to answer — your question is still here, ask again when you're back online. Meanwhile, your downloaded lectures, notes and the transcript work offline." }]);
      return;
    }
    setLoading(true);
    try {
      const raw = await callGemini(buildPrompt(t));
      setMessages((prev) => [...prev, { role: 'assistant', text: raw }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: 'assistant', text: e?.message || "Sorry, I couldn't process that request right now." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Sparkles size={18} color={C.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.white, fontWeight: '600', fontSize: 15 }}>AI Tutor</Text>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }} numberOfLines={1}>
            {lecture ? lecture.title : 'Ask any educational question'}
          </Text>
        </View>
        <Pressable hitSlop={8} onPress={() => setMessages([welcome(lecture, true)])} style={styles.hBtn}>
          <Trash2 size={18} color={C.white} />
        </Pressable>
        <Pressable hitSlop={8} onPress={() => router.back()} style={styles.hBtn}>
          <X size={20} color={C.white} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {messages.map((m, i) => {
            const user = m.role === 'user';
            return (
              <View key={i} style={[styles.msgRow, user && { flexDirection: 'row-reverse' }]}>
                <View style={[styles.avatar, { backgroundColor: user ? C.primary10 : '#ede9fe' }]}>{user ? <User size={14} color={C.primary} /> : <Bot size={14} color={C.violet} />}</View>
                <View style={[styles.bubble, user ? styles.userBubble : styles.botBubble]}>
                  <RichText text={m.text} color={user ? C.white : C.gray900} />
                </View>
              </View>
            );
          })}
          {loading ? (
            <View style={styles.msgRow}>
              <View style={[styles.avatar, { backgroundColor: '#ede9fe' }]}>
                <Bot size={14} color={C.violet} />
              </View>
              <View style={[styles.bubble, styles.botBubble]}>
                <ActivityIndicator size="small" color={C.violet} />
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput value={input} onChangeText={setInput} placeholder="Type your question..." placeholderTextColor={C.gray400} style={styles.input} multiline onSubmitEditing={send} />
          <Pressable onPress={send} disabled={!input.trim() || loading} style={[styles.send, (!input.trim() || loading) && { opacity: 0.5 }]}>
            <Send size={18} color={C.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, backgroundColor: C.violet },
  headerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  hBtn: { padding: 6 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: R.lg },
  userBubble: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: C.white, borderWidth: 1, borderColor: C.gray100, borderBottomLeftRadius: 4 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: C.gray100, backgroundColor: C.white },
  input: { flex: 1, maxHeight: 120, borderWidth: 1, borderColor: C.gray200, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.black },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.violet, alignItems: 'center', justifyContent: 'center' },
});
