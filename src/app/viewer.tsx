import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { C, R } from '@/constants/theme';

/** In-app viewer for lecture documents, external links and resources. */
export default function Viewer() {
  const { uri, title } = useLocalSearchParams<{ uri: string; title?: string }>();
  const [loading, setLoading] = useState(true);
  const isLocal = uri?.startsWith('file://');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.white }} edges={['top', 'bottom']}>
      <View style={styles.bar}>
        <Pressable hitSlop={10} onPress={() => router.back()} style={{ padding: 6, borderRadius: R.sm }}>
          <ArrowLeft size={18} color={C.gray500} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title || 'Document'}
        </Text>
        {isLocal ? <Text style={styles.offline}>Offline copy</Text> : null}
      </View>
      <View style={{ flex: 1 }}>
        <WebView
          source={{ uri }}
          originWhitelist={['*']}
          allowFileAccess
          allowingReadAccessToURL={isLocal ? uri.substring(0, uri.lastIndexOf('/') + 1) : undefined}
          allowsInlineMediaPlayback
          onLoadEnd={() => setLoading(false)}
          style={{ flex: 1 }}
        />
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={C.primary} />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 },
  title: { flex: 1, fontSize: 14, fontWeight: '500', color: C.black },
  offline: { fontSize: 11, color: C.primary, backgroundColor: C.primary10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.full, overflow: 'hidden' },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: C.white },
});
