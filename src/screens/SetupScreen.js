import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { db, storage } from '../firebase';
import { doc, setDoc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { generateId } from '../utils';
import { colors, AVATAR_EMOJIS } from '../theme';

// 방 코드 생성 후 중복 확인
const genUniqueCode = async () => {
  for (let i = 0; i < 10; i++) {
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    const snap = await getDoc(doc(db, 'rooms', code));
    if (!snap.exists()) return code;
  }
  return Math.random().toString(36).substr(2, 8).toUpperCase(); // 8자리 폴백
};

export default function SetupScreen({ onEnter, savedMe }) {
  const [tab, setTab] = useState('create');
  // savedMe가 있으면 기존 정보 자동 채우기 (버그 #3 수정)
  const [nick, setNick] = useState(savedMe?.nick || '');
  const [roomCode, setRoomCode] = useState('');
  const [avatarEmoji, setAvatarEmoji] = useState(savedMe?.emoji || AVATAR_EMOJIS[0]);
  const [avatarUri, setAvatarUri] = useState(null);
  const [loading, setLoading] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('갤러리 접근 권한이 필요해요'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (!result.canceled) setAvatarUri(result.assets[0].uri);
  };

  const uploadAvatar = async (userId) => {
    if (!avatarUri) return savedMe?.photoURL || '';
    const response = await fetch(avatarUri);
    const blob = await response.blob();
    const storageRef = ref(storage, `avatars/${userId}`);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  const handleStart = async () => {
    if (!nick.trim()) { Alert.alert('닉네임을 입력해주세요'); return; }
    if (tab === 'join' && roomCode.trim().length < 4) { Alert.alert('방 코드를 입력해주세요'); return; }
    setLoading(true);
    try {
      // savedMe가 있고 프로필 변경 없으면 기존 ID 유지
      const userId = savedMe?.id || generateId();
      const photoURL = await uploadAvatar(userId);
      const member = {
        id: userId,
        nick: nick.trim(),
        photoURL,
        emoji: avatarEmoji,
      };

      if (tab === 'create') {
        const code = await genUniqueCode(); // 중복 확인 (버그 #5 수정)
        await setDoc(doc(db, 'rooms', code), {
          code, members: [member], createdAt: serverTimestamp(),
        });
        onEnter({ roomCode: code, me: member });
      } else {
        const code = roomCode.trim().toUpperCase();
        const snap = await getDoc(doc(db, 'rooms', code));
        if (!snap.exists()) { Alert.alert('방을 찾을 수 없어요'); setLoading(false); return; }
        const data = snap.data();
        const members = data.members || [];

        // ID 기반 재입장 확인 (닉네임 아님 — 보안 버그 #2 수정)
        const existingById = members.find(m => m.id === member.id);
        if (existingById) {
          onEnter({ roomCode: code, me: existingById });
        } else {
          if (members.length >= 2) {
            Alert.alert('입장 불가', '이미 2명이 입장한 방이에요');
            setLoading(false);
            return;
          }
          await updateDoc(doc(db, 'rooms', code), { members: arrayUnion(member) });
          onEnter({ roomCode: code, me: member });
        }
      }
    } catch (e) {
      console.error(e);
      Alert.alert('오류가 발생했어요', e.message);
    }
    setLoading(false);
  };

  const currentPhoto = avatarUri || savedMe?.photoURL;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logo}>
          <Text style={s.logoIcon}>💬</Text>
          <Text style={s.logoText}>DuoChat</Text>
        </View>

        <View style={s.tabs}>
          <TouchableOpacity style={[s.tab, tab==='create' && s.tabActive]} onPress={() => setTab('create')}>
            <Text style={[s.tabText, tab==='create' && s.tabTextActive]}>방 만들기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, tab==='join' && s.tabActive]} onPress={() => setTab('join')}>
            <Text style={[s.tabText, tab==='join' && s.tabTextActive]}>방 입장</Text>
          </TouchableOpacity>
        </View>

        <View style={s.section}>
          <Text style={s.label}>프로필</Text>
          <View style={s.avatarRow}>
            <TouchableOpacity onPress={pickImage} style={s.avatarCircle}>
              {currentPhoto
                ? <Image source={{ uri: currentPhoto }} style={s.avatarImg}/>
                : <Text style={s.avatarEmoji}>{avatarEmoji}</Text>
              }
            </TouchableOpacity>
            <View style={s.avatarRight}>
              <TouchableOpacity style={s.uploadBtn} onPress={pickImage}>
                <Text style={s.uploadBtnText}>사진 변경</Text>
              </TouchableOpacity>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {AVATAR_EMOJIS.map(e => (
                  <TouchableOpacity key={e} onPress={() => { setAvatarEmoji(e); setAvatarUri(null); }}
                    style={[s.emojiOpt, avatarEmoji === e && !currentPhoto && s.emojiOptActive]}>
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.label}>닉네임</Text>
          <TextInput style={s.input} placeholder="나를 뭐라고 부를까요?" placeholderTextColor={colors.text3}
            value={nick} onChangeText={setNick} maxLength={12} returnKeyType="done"/>
        </View>

        {tab === 'join' && (
          <View style={s.section}>
            <Text style={s.label}>방 코드</Text>
            <TextInput style={[s.input, s.codeInput]} placeholder="XXXXXX" placeholderTextColor={colors.text3}
              value={roomCode} onChangeText={t => setRoomCode(t.toUpperCase())} maxLength={6}
              autoCapitalize="characters" returnKeyType="done"/>
          </View>
        )}

        <TouchableOpacity style={s.btn} onPress={handleStart} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff"/>
            : <Text style={s.btnText}>{tab === 'create' ? '방 만들기' : '입장하기'}</Text>
          }
        </TouchableOpacity>

        <Text style={s.hint}>
          {tab === 'create' ? '방을 만들고 코드를 상대방에게 공유하세요' : '상대방에게 받은 6자리 코드를 입력하세요'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoIcon: { fontSize: 32 },
  logoText: { fontSize: 22, fontWeight: '600', color: colors.text },
  tabs: { flexDirection: 'row', backgroundColor: colors.bg3, borderRadius: 10, padding: 3, width: '100%', marginBottom: 24 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: colors.bg4 },
  tabText: { fontSize: 14, color: colors.text2, fontWeight: '500' },
  tabTextActive: { color: colors.text },
  section: { width: '100%', marginBottom: 20 },
  label: { fontSize: 11, color: colors.text3, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.bg3,
    borderWidth: 0.5, borderColor: colors.border2,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: 64, height: 64, borderRadius: 32 },
  avatarEmoji: { fontSize: 28 },
  avatarRight: { flex: 1 },
  uploadBtn: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8,
    backgroundColor: colors.bg3, borderWidth: 0.5, borderColor: colors.border2,
    alignSelf: 'flex-start',
  },
  uploadBtnText: { fontSize: 13, color: colors.text2 },
  emojiOpt: { padding: 4, borderRadius: 6, marginRight: 4 },
  emojiOptActive: { backgroundColor: colors.bg4 },
  input: {
    backgroundColor: colors.bg3, borderWidth: 0.5, borderColor: colors.border,
    borderRadius: 10, padding: 13, color: colors.text, fontSize: 15, width: '100%',
  },
  codeInput: { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 4, fontSize: 18 },
  btn: { width: '100%', paddingVertical: 14, backgroundColor: colors.accent, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, color: colors.text3, textAlign: 'center', marginTop: 16 },
});
