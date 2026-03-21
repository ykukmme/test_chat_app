import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { Platform, AppState } from 'react-native';
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

// ── 푸시 토큰 등록 ─────────────────────────────────────────
export async function registerForPushNotifications(roomCode, memberId) {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  // 안드로이드 채널 설정 (앱 최초 실행 또는 채널 변경 시)
  if (Platform.OS === 'android') {
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

  // projectId 없이 getExpoPushTokenAsync 호출 시 에러 방지
  let token = null;
  try {
    const result = await Notifications.getExpoPushTokenAsync();
    token = result.data;
  } catch (e) {
    console.warn('푸시 토큰 획득 실패 (Expo Go에서는 정상):', e.message);
    return null;
  }

  // Firestore에 토큰 저장
  try {
    await updateDoc(doc(db, 'rooms', roomCode), {
      [`pushTokens.${memberId}`]: token,
    });
  } catch (e) {
    console.warn('토큰 저장 실패:', e.message);
  }

  return token;
}

// ── 푸시 알림 전송 ─────────────────────────────────────────
export async function sendPushNotification(expoPushToken, senderNick, message) {
  if (!expoPushToken) return;

  // 빈 메시지 방어
  const body = message.mediaType === 'image' ? '사진을 보냈어요 📷'
    : message.mediaType === 'video' ? '동영상을 보냈어요 🎥'
    : message.mediaType === 'file'  ? '파일을 보냈어요 📎'
    : (message.text || '').trim() || '메시지를 보냈어요';

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: expoPushToken,
        sound: 'default',
        title: senderNick,
        body,
        data: { roomCode: message.roomCode },
        priority: 'high',
        android: {
          channelId: 'duo-chat',
          priority: 'high',
          vibrate: [0, 300, 100, 300],
        },
      }),
    });
    const json = await res.json();
    // Expo 서버 응답 오류 확인
    if (json?.data?.status === 'error') {
      console.warn('Expo 푸시 오류:', json.data.message);
    }
  } catch (e) {
    console.warn('알림 전송 실패:', e.message);
    // 알림 실패는 조용히 처리 — 채팅은 계속 정상 작동
  }
}

// ── 포그라운드 햅틱 진동 (내 메시지 제외) ──────────────────
export async function vibrateOnMessage() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (e) {
    // 햅틱 미지원 기기 무시
  }
}

// ── 알림 리스너 훅 ─────────────────────────────────────────
// 알림 탭 시 해당 방으로 이동
export function setupNotificationListeners(onTapNotification) {
  const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
    const roomCode = response.notification.request.content.data?.roomCode;
    if (roomCode && onTapNotification) onTapNotification(roomCode);
  });
  return () => responseListener.remove();
}
