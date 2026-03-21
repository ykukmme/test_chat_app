import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import SetupScreen from './src/screens/SetupScreen';
import RoomListScreen from './src/screens/RoomListScreen';
import ChatScreen from './src/screens/ChatScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setupNotificationListeners } from './src/notifications';

const ROOMS_KEY = 'my_rooms_v2';
const ME_KEY = 'my_profile_v1';

async function saveRoomToList(roomCode) {
  try {
    const raw = await AsyncStorage.getItem(ROOMS_KEY);
    const rooms = raw ? JSON.parse(raw) : [];
    if (!rooms.find(r => r.roomCode === roomCode)) {
      const newRoom = {
        roomCode,
        customName: '',
        emoji: ['💬','🎮','🍕','🎵','📚','✈️','💡','🌙'][Math.floor(Math.random()*8)],
        joinedAt: Date.now(),
      };
      await AsyncStorage.setItem(ROOMS_KEY, JSON.stringify([newRoom, ...rooms]));
    }
  } catch(e) {}
}

async function saveMe(me) {
  try { await AsyncStorage.setItem(ME_KEY, JSON.stringify(me)); } catch(e) {}
}

async function loadMe() {
  try {
    const raw = await AsyncStorage.getItem(ME_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e) { return null; }
}

function AppInner() {
  const { theme } = useTheme();
  const [screen, setScreen] = useState('loading');
  const [me, setMe] = useState(null);
  const [chatSession, setChatSession] = useState(null);

  useEffect(() => {
    (async () => {
      const savedMe = await loadMe();
      if (savedMe) { setMe(savedMe); setScreen('list'); }
      else setScreen('setup');
    })();
  }, []);

  // 알림 탭 시 해당 방으로 이동
  useEffect(() => {
    const cleanup = setupNotificationListeners((roomCode) => {
      if (me) {
        setChatSession({ roomCode, me });
        setScreen('chat');
      }
    });
    return cleanup;
  }, [me]);

  const handleSetupDone = async (session) => {
    await saveMe(session.me);
    await saveRoomToList(session.roomCode);
    setMe(session.me);
    setChatSession(session);
    setScreen('chat');
  };

  const handleEnterRoom = async (session) => {
    await saveRoomToList(session.roomCode);
    setChatSession(session);
    setScreen('chat');
  };

  if (screen === 'loading') {
    return (
      <View style={{ flex:1, backgroundColor:'#0e0e10', alignItems:'center', justifyContent:'center' }}>
        <ActivityIndicator color="#7c6aff" size="large"/>
      </View>
    );
  }
  if (screen === 'setup') {
    return (
      <>
        <StatusBar style={theme.statusBar}/>
        {/* savedMe 전달 — 프로필 자동 채우기 (버그 #3 수정) */}
        <SetupScreen savedMe={me} onEnter={handleSetupDone}/>
      </>
    );
  }
  if (screen === 'chat' && chatSession) {
    return (
      <>
        <StatusBar style={theme.statusBar}/>
        <ChatScreen session={chatSession} onLeave={() => { setChatSession(null); setScreen('list'); }}/>
      </>
    );
  }
  return (
    <>
      <StatusBar style={theme.statusBar}/>
      <RoomListScreen
        me={me}
        onEnterRoom={handleEnterRoom}
        onGoSetup={() => setScreen('setup')}
      />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner/>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
