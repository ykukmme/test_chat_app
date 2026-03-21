import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { db } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';

// 포그라운드 알림 수신 시 동작 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldVibrate: true,   // 포그라운드 진동
  }),
});

export async function registerForPushNotifications(roomCode, memberId) {
  if (!Device.isDevice) {
    console.log('푸시 알림은 실제 기기에서만 작동해요');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('알림 권한이 거부됐어요');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('duo-chat', {
      name: 'DuoChat 메시지',
      importance: Notifications.AndroidImportance.MAX,
      // 진동 패턴: 대기-진동-대기-진동 (ms 단위)
      vibrationPattern: [0, 300, 100, 300],
      enableVibrate: true,
      lightColor: '#7c6aff',
      sound: true,
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  try {
    await updateDoc(doc(db, 'rooms', roomCode), {
      [`pushTokens.${memberId}`]: token,
    });
  } catch (e) {
    console.error('토큰 저장 실패:', e);
  }

  return token;
}

export async function sendPushNotification(expoPushToken, senderNick, message) {
  if (!expoPushToken) return;

  const body = message.mediaType === 'image' ? '사진을 보냈어요 📷'
    : message.mediaType === 'video' ? '동영상을 보냈어요 🎥'
    : message.mediaType === 'file'  ? '파일을 보냈어요 📎'
    : message.text;

  await fetch('https://exp.host/--/api/v2/push/send', {
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
      android: {
        channelId: 'duo-chat',
        priority: 'high',
        // 백그라운드 알림 진동 패턴 명시
        vibrate: [0, 300, 100, 300],
      },
    }),
  });
}

// 앱 포그라운드에서 메시지 받을 때 햅틱 진동 (expo-haptics)
export async function vibrateOnMessage() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (e) {
    // 햅틱 미지원 기기 무시
  }
}

export function useNotificationListener(onTap) {
  return {
    foreground: Notifications.addNotificationReceivedListener(() => {
      // 포그라운드 수신 시 shouldVibrate: true 로 자동 처리됨
    }),
    response: Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.roomCode && onTap) onTap(data.roomCode);
    }),
  };
}
