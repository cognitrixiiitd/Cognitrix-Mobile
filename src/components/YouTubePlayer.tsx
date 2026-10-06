import { useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { C, R } from '@/constants/theme';

export type PlayerHandle = { seekTo: (seconds: number) => void };

// YouTube rejects embeds without a valid referrer/origin (error 152/153), so the
// HTML is served with a stable https baseUrl that matches the `origin` player var.
const ORIGIN = 'https://cognitrix.app';

function buildHtml(videoId: string, start: number) {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}#p{position:absolute;inset:0;width:100%;height:100%}</style>
</head><body><div id="p"></div>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
var player;
function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
function onYouTubeIframeAPIReady(){
  player = new YT.Player('p', {
    videoId: '${videoId}',
    playerVars: { playsinline: 1, rel: 0, modestbranding: 1, start: ${Math.floor(start)}, origin: '${ORIGIN}' },
    events: {
      onReady: function(){ post({type:'ready', duration: player.getDuration()}); },
      onStateChange: function(e){ post({type:'state', state:e.data, time: player.getCurrentTime()}); },
      onError: function(e){ post({type:'error', code:e.data}); }
    }
  });
  setInterval(function(){
    if (player && player.getCurrentTime) post({type:'time', time: player.getCurrentTime(), duration: player.getDuration()});
  }, 1000);
}
</script></body></html>`;
}

export default function YouTubePlayer({
  videoId,
  start = 0,
  onTime,
  onStateChange,
  ref,
}: {
  videoId: string;
  start?: number;
  onTime?: (time: number, duration: number) => void;
  onStateChange?: (state: 'playing' | 'paused' | 'ended', time: number) => void;
  ref?: Ref<PlayerHandle>;
}) {
  const webRef = useRef<WebView>(null);
  // Only rebuild HTML when the video changes; seeking is done through the API.
  const html = useMemo(() => buildHtml(videoId, start), [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      webRef.current?.injectJavaScript(`player && player.seekTo(${Math.floor(seconds)}, true); player && player.playVideo(); true;`);
    },
  }));

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === 'time' || m.type === 'ready') onTime?.(m.time ?? 0, m.duration ?? 0);
      if (m.type === 'state') {
        if (m.state === 1) onStateChange?.('playing', m.time);
        else if (m.state === 2) onStateChange?.('paused', m.time);
        else if (m.state === 0) onStateChange?.('ended', m.time);
      }
    } catch {
      // ignore malformed messages
    }
  };

  return (
    <View style={styles.frame}>
      <WebView
        key={videoId}
        ref={webRef}
        source={{ html, baseUrl: ORIGIN }}
        originWhitelist={['*']}
        onMessage={onMessage}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        scrollEnabled={false}
        style={{ backgroundColor: '#000' }}
        // Don't navigate the player away when someone taps the YouTube logo.
        onShouldStartLoadWithRequest={(req) => req.isTopFrame === false || req.url.startsWith(ORIGIN) || req.url === 'about:blank'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 16 / 9, borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.black },
});
