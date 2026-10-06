import { router } from 'expo-router';
import { FileText, HardDriveDownload, Paperclip, PlayCircle, Trash2 } from 'lucide-react-native';
import { Alert, Pressable, Text, View } from 'react-native';

import { Button, Card, EmptyState, IconBox, Row, Screen } from '@/components/ui';
import { C } from '@/constants/theme';
import { openDocument } from '@/lib/documents';
import { formatBytes, freeSpace, remove, removeAll, useDownloads, type DownloadEntry } from '@/lib/downloads';

/** Everything saved on this phone for offline study, grouped by course. */
export default function Downloads() {
  const items = useDownloads();
  const used = items.reduce((s, d) => s + (d.size || 0), 0);
  const free = freeSpace();

  const byCourse = items.reduce<Record<string, DownloadEntry[]>>((acc, d) => {
    (acc[d.courseId] ??= []).push(d);
    return acc;
  }, {});

  const open = (d: DownloadEntry) => {
    if (d.kind === 'video') router.push(`/player/${d.courseId}?lecture=${d.lectureId}`);
    else openDocument({ title: d.name, localUri: d.fileUri });
  };

  const confirmRemove = (keys: string[], what: string) =>
    Alert.alert(`Remove ${what}?`, 'You can download it again when you are online.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove(keys) },
    ]);

  return (
    <Screen edges={['bottom']}>
      <Card style={{ marginBottom: 16 }}>
        <Row style={{ gap: 12 }}>
          <IconBox icon={HardDriveDownload} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>{formatBytes(used)} used</Text>
            <Text style={{ fontSize: 12, color: C.gray500 }}>
              {items.length} file{items.length === 1 ? '' : 's'} saved{free != null ? ` · ${formatBytes(free)} free on phone` : ''}
            </Text>
          </View>
          {items.length > 0 ? (
            <Button
              title="Clear all"
              variant="danger"
              size="sm"
              onPress={() =>
                Alert.alert('Remove all downloads?', 'This frees up space on your phone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove all', style: 'destructive', onPress: removeAll },
                ])
              }
            />
          ) : null}
        </Row>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          icon={HardDriveDownload}
          title="No downloads yet"
          description="Open a lecture and tap “Download for offline” to study without internet. Your professor decides which lectures can be downloaded."
        />
      ) : (
        Object.values(byCourse).map((group) => (
          <View key={group[0].courseId} style={{ marginBottom: 20 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <Pressable style={{ flex: 1 }} onPress={() => router.push(`/player/${group[0].courseId}`)}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: C.black }} numberOfLines={1}>
                  {group[0].courseTitle}
                </Text>
                <Text style={{ fontSize: 12, color: C.gray400 }}>{formatBytes(group.reduce((s, d) => s + d.size, 0))}</Text>
              </Pressable>
              <Button title="Remove" variant="ghost" size="sm" onPress={() => confirmRemove(group.map((d) => d.key), 'this course’s downloads')} />
            </Row>
            {group.map((d) => {
              const Icon = d.kind === 'video' ? PlayCircle : d.kind === 'document' ? FileText : Paperclip;
              return (
                <Card key={d.key} onPress={() => open(d)} style={{ marginBottom: 8, padding: 12 }}>
                  <Row style={{ gap: 12 }}>
                    <IconBox icon={Icon} size={36} iconSize={18} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: C.black }} numberOfLines={1}>
                        {d.kind === 'attachment' ? d.name : d.lectureTitle}
                      </Text>
                      <Text style={{ fontSize: 12, color: C.gray400 }}>
                        {d.kind === 'attachment' ? `Attachment · ${d.lectureTitle}` : d.kind === 'video' ? 'Video' : 'Document'} · {formatBytes(d.size)}
                      </Text>
                    </View>
                    <Pressable hitSlop={8} onPress={() => confirmRemove([d.key], 'this download')}>
                      <Trash2 size={16} color={C.gray400} />
                    </Pressable>
                  </Row>
                </Card>
              );
            })}
          </View>
        ))
      )}
    </Screen>
  );
}
