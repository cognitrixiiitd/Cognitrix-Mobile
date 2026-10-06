import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useImperativeHandle, type Ref } from 'react';
import { StyleSheet } from 'react-native';

import { C, R } from '@/constants/theme';

import type { PlayerHandle } from './YouTubePlayer';

/** Player for lectures uploaded directly to Supabase storage (type "video"). */
export default function NativeVideo({ uri, start = 0, onTime, ref }: {
  uri: string;
  start?: number;
  onTime?: (time: number, duration: number) => void;
  ref?: Ref<PlayerHandle>;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.timeUpdateEventInterval = 1;
    if (start > 0) p.currentTime = start;
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    onTime?.(currentTime, player.duration);
  });

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      player.currentTime = seconds;
      player.play();
    },
  }));

  return <VideoView player={player} style={styles.video} nativeControls allowsPictureInPicture fullscreenOptions={{ enable: true }} contentFit="contain" />;
}

const styles = StyleSheet.create({
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.black },
});
