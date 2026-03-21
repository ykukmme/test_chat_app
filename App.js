import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import SetupScreen from './src/screens/SetupScreen';
import RoomListScreen from './src/screens/RoomListScreen';
import ChatScreen from './src/screens/ChatScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ROOMS_KEY = 'my_rooms_v2';

// 방 목록에 새 방 저장
async function saveRoomToList(roomCode, me) {
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

function AppInner() {
  const { theme } = useTheme();
  // screen: 'setup' | 'list' | 'chat'
  const [screen, setScreen] = useState('setup');
  const [me, setMe] = useState(null);
  const [chatSession, setChatSession] = useState(null);

  const handleSetupDone = async (session) => {
    setMe(session.me);
    await saveRoomToList(session.roomCode, session.me);
    setChatSession(session);
    setScreen('chat');
  };

  const handleEnterRoom = (session) => {
    setChatSession(session);
    setScreen('chat');
  };

  const handleLeaveChat = () => {
    setChatSession(null);
    setScreen('list');
  };

  const handleGoSetup = () => {
    setScreen('setup');
  };

  if (screen === 'setup') {
    return (
      <>
        <StatusBar style={theme.statusBar} />
        <SetupScreen onEnter={(session) => {
          setMe(session.me);
          handleSetupDone(session);
        }} />
      </>
    );
  }

  if (screen === 'chat' && chatSession) {
    return (
      <>
        <StatusBar style={theme.statusBar} />
        <ChatScreen session={chatSession} onLeave={handleLeaveChat} />
      </>
    );
  }

  // list (default after first setup)
  return (
    <>
      <StatusBar style={theme.statusBar} />
      <RoomListScreen
        me={me}
        onEnterRoom={(session) => {
          saveRoomToList(session.roomCode, session.me || me);
          handleEnterRoom(session);
        }}
        onGoSetup={handleGoSetup}
      />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
