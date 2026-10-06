import { File } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { router } from 'expo-router';
import { Alert, Platform } from 'react-native';

import { mimeFor } from './downloads';
import { isOnline, OFFLINE_MESSAGE } from './network';

const FLAG_GRANT_READ_URI_PERMISSION = 1;

/**
 * Opens a lecture document (PDF, slides, attachment) inside the app wherever possible.
 * - iOS: in-app viewer (WKWebView renders PDF/Office files natively, local or remote).
 * - Android remote: in-app viewer via Google's document embed.
 * - Android downloaded file: Android's WebView can't render local PDFs, so the file is
 *   handed to the phone's PDF viewer (works offline).
 */
export async function openDocument({ title, remoteUrl, localUri }: { title: string; remoteUrl?: string | null; localUri?: string | null }) {
  if (localUri) {
    if (Platform.OS === 'android') {
      try {
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: new File(localUri).contentUri,
          flags: FLAG_GRANT_READ_URI_PERMISSION,
          type: mimeFor(localUri),
        });
      } catch {
        Alert.alert('No app to open this file', 'Install a PDF viewer (e.g. Google Drive PDF Viewer) to open downloaded documents offline.');
      }
      return;
    }
    router.push({ pathname: '/viewer', params: { title, uri: localUri } });
    return;
  }

  if (!remoteUrl) return;
  if (!isOnline()) {
    Alert.alert('Not downloaded', `${OFFLINE_MESSAGE} Download this lecture while online to read it offline.`);
    return;
  }
  const uri =
    Platform.OS === 'android' && /\.(pdf|pptx?|docx?)(\?|$)/i.test(remoteUrl)
      ? `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(remoteUrl)}`
      : remoteUrl;
  router.push({ pathname: '/viewer', params: { title, uri } });
}
