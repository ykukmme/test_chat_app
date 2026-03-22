import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { db } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';

// ── 포그라운드 알림 핸들러 ──────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldVibrate: true,
  }),
});

// ── 안드로이드 채널 생성 ────────────────────────────────────
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('duo-chat', {
    name: 'DuoChat 메시지',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 300, 100, 300],
    enableVibrate: true,
    lightColor: '#7c6aff',
    sound: true,
    showBadge: true,
  });
}

// ── projectId 가져오기 (여러 방식 fallback) ─────────────────
// expo-constants 없이도 동작하도록 try/catch로 감쌈
function getProjectId() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    return (
      Constants?.expoConfig?.extra?.eas?.projectId ||
      Constants?.easConfig?.projectId ||
      Constants?.expoConfig?.projectId ||
      null
    );
  } catch (e) {
    return null;
  }
}

// ── 푸시 토큰 등록 ─────────────────────────────────────────
export async function registerForPushNotifications(roomCode, memberId) {
  if (!Device.isDevice) {
    console.log('[알림] 실기기에서만 푸시 알림이 동작해요.');
    return null;
  }

  await ensureAndroidChannel();

  // 권한 요청
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('[알림] 권한 거부됨. 설정에서 알림을 허용해주세요.');
    return null;
  }

  // ── 토큰 발급 ─────────────────────────────────────────────
  // projectId가 있으면 명시적으로 전달, 없으면 없이 시도
  // Expo Go: projectId 없어도 동작 / EAS Build: projectId 필수
  let token = null;
  try {
    const projectId = getProjectId();
    const tokenOptions = projectId ? { projectId } : {};
    const result = await Notifications.getExpoPushTokenAsync(tokenOptions);
    token = result.data;
    console.log('[알림] 토큰 발급 성공:', token?.slice(0, 30) + '...');
  } catch (e) {
    console.warn('[알림] 토큰 발급 실패:', e.message);
    // EAS Build로 만든 APK에서 실패 시 — app.json에 projectId 확인 필요
    if (e.message?.includes('projectId')) {
      console.warn('[알림] 해결: https://expo.dev 에서 프로젝트 ID를 확인하고 app.json > extra.eas.projectId에 입력하세요');
    }
    return null;
  }

  if (!token) return null;

  // Firestore에 토큰 저장
  try {
    await updateDoc(doc(db, 'rooms', roomCode), {
      [`pushTokens.${memberId}`]: token,
    });
    console.log('[알림] 토큰 저장 완료');
  } catch (e) {
    console.warn('[알림] 토큰 저장 실패 (방이 없거나 권한 문제):', e.message);
  }

  return token;
}

// ── 푸시 알림 전송 ─────────────────────────────────────────
export async function sendPushNotification(expoPushToken, senderNick, message) {
  if (!expoPushToken) return;

  // 유효한 Expo 토큰인지 확인
  if (!expoPushToken.startsWith('ExponentPushToken[')) {
    console.warn('[알림] 유효하지 않은 토큰 형식. Expo 푸시 토큰이어야 해요:', expoPushToken?.slice(0, 30));
    return;
  }

  const body =
    message.mediaType === 'image' ? '사진을 보냈어요 📷' :
    message.mediaType === 'video' ? '동영상을 보냈어요 🎥' :
    message.mediaType === 'file'  ? '파일을 보냈어요 📎' :
    (message.text || '').trim() || '메시지를 보냈어요';

  const payload = {
    to: expoPushToken,
    sound: 'default',
    title: senderNick,
    body,
    data: { roomCode: message.roomCode },
    priority: 'high',
    channelId: 'duo-chat',
    android: {
      channelId: 'duo-chat',
      priority: 'high',
      vibrate: [0, 300, 100, 300],
      sound: 'default',
    },
  };

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn('[알림] Expo 서버 HTTP 오류:', res.status);
      return;
    }

    const json = await res.json();
    const result = json?.data;

    if (result?.status === 'error') {
      console.warn('[알림] 전송 오류:', result.message);
      if (result.details?.error === 'DeviceNotRegistered') {
        console.warn('[알림] 기기에 앱이 없거나 알림이 꺼진 상태예요.');
      }
      if (result.details?.error === 'InvalidCredentials') {
        console.warn('[알림] app.json projectId가 올바르지 않아요.');
      }
    } else {
      console.log('[알림] 전송 성공 ✓');
    }
  } catch (e) {
    console.warn('[알림] 네트워크 오류:', e.message);
  }
}

// ── 포그라운드 햅틱 진동 ────────────────────────────────────
export async function vibrateOnMessage() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (e) {}
}

// ── 알림 탭 리스너 ─────────────────────────────────────────
export function setupNotificationListeners(onTapNotification) {
  const listener = Notifications.addNotificationResponseReceivedListener(response => {
    const roomCode = response.notification.request.content.data?.roomCode;
    if (roomCode && onTapNotification) onTapNotification(roomCode);
  });
  return () => listener.remove();
}
