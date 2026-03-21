import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  Alert, TextInput, Modal, Platform, Switch, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, arrayUnion, collection, query, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { useTheme } from '../context/ThemeContext';

const ROOMS_KEY = 'my_rooms_v2';

// ── 방 카드 ────────────────────────────────────────────────
// me를 prop으로 받아야 ReferenceError 없음 (버그 #1 수정)
function RoomCard({ room, me, onEnter, onRename, onLeave, theme }) {
  const s = makeStyles(theme);
  return (
    <TouchableOpacity style={s.card} onPress={() => onEnter({ roomCode: room.roomCode, me })} activeOpacity={0.75}>
      <View style={s.cardAvatar}>
        <Text style={{ fontSize: 22 }}>{room.emoji || '💬'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.cardName} numberOfLines={1}>
          {room.customName || room.roomCode}
        </Text>
        <Text style={s.cardSub} numberOfLines={1}>
          {room.lastMsg || '메시지 없음'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {room.lastTime ? <Text style={s.cardTime}>{room.lastTime}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => onRename(room)} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
            <Text style={s.cardAction}>이름 변경</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onLeave(room)} hitSlop={{ top:8,bottom:8,left:8,right:8 }}>
            <Text style={[s.cardAction, { color: theme.red }]}>나가기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function RoomListScreen({ me, onEnterRoom, onGoSetup }) {
  const { theme, toggleTheme } = useTheme();
  const s = makeStyles(theme);

  const [rooms, setRooms] = useState([]);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameText, setRenameText] = useState('');
  const [newCodeVisible, setNewCodeVisible] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [joining, setJoining] = useState(false);

  // ── 방 목록 로드 ──────────────────────────────────────────
  const loadRooms = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(ROOMS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      const enriched = await Promise.all(parsed.map(async (room) => {
        try {
          const q = query(
            collection(db, 'rooms', room.roomCode, 'messages'),
            orderBy('createdAt', 'desc'), limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            const msg = snap.docs[0].data();
            const ts = msg.createdAt?.toDate?.() || new Date();
            const now = new Date();
            const isToday = ts.toDateString() === now.toDateString();
            const timeStr = isToday
              ? ts.getHours().toString().padStart(2,'0')+':'+ts.getMinutes().toString().padStart(2,'0')
              : `${ts.getMonth()+1}/${ts.getDate()}`;
            const preview = msg.mediaType === 'image' ? '📷 사진'
              : msg.mediaType === 'video' ? '🎥 동영상'
              : msg.mediaType === 'file'  ? '📎 파일'
              : msg.text || '';
            return { ...room, lastMsg: preview, lastTime: timeStr };
          }
        } catch {}
        return room;
      }));
      setRooms(enriched);
    } catch (e) {
      console.error('방 목록 로드 실패', e);
    }
  }, []);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // ── 방 저장 ────────────────────────────────────────────────
  const saveRooms = async (updated) => {
    const toSave = updated.map(({ lastMsg, lastTime, ...rest }) => rest);
    await AsyncStorage.setItem(ROOMS_KEY, JSON.stringify(toSave));
  };

  // ── 코드로 입장 (Firebase 검증 포함 — 버그 #4 수정) ────────
  const addRoom = async (roomCode) => {
    const code = roomCode.trim().toUpperCase();
    if (!code || code.length < 4) { Alert.alert('코드를 확인해주세요'); return; }
    if (rooms.find(r => r.roomCode === code)) {
      // 이미 목록에 있으면 바로 입장
      setNewCode(''); setNewCodeVisible(false);
      onEnterRoom({ roomCode: code, me });
      return;
    }

    setJoining(true);
    try {
      const snap = await getDoc(doc(db, 'rooms', code));
      if (!snap.exists()) {
        Alert.alert('방을 찾을 수 없어요', '코드를 다시 확인해주세요');
        setJoining(false);
        return;
      }
      const data = snap.data();
      const members = data.members || [];

      // 내 ID로 기존 멤버 여부 확인 (닉네임이 아닌 ID 기준 — 버그 #2 수정)
      const existingMe = members.find(m => m.id === me.id);
      if (!existingMe && members.length >= 2) {
        Alert.alert('입장 불가', '이미 2명이 입장한 방이에요');
        setJoining(false);
        return;
      }

      // 새 멤버면 Firestore에 추가
      if (!existingMe) {
        await updateDoc(doc(db, 'rooms', code), { members: arrayUnion(me) });
      }

      const newRoom = {
        roomCode: code,
        customName: '',
        emoji: ['💬','🎮','🍕','🎵','📚','✈️','💡','🌙'][Math.floor(Math.random()*8)],
        joinedAt: Date.now(),
      };
      const updated = [newRoom, ...rooms];
      setRooms(updated);
      await saveRooms(updated);
      setNewCode(''); setNewCodeVisible(false);
      onEnterRoom({ roomCode: code, me });
    } catch (e) {
      Alert.alert('오류가 발생했어요', e.message);
    }
    setJoining(false);
  };

  // ── 방 이름 변경 ────────────────────────────────────────────
  const handleRename = async () => {
    if (!renameTarget) return;
    const updated = rooms.map(r =>
      r.roomCode === renameTarget.roomCode ? { ...r, customName: renameText.trim() } : r
    );
    setRooms(updated);
    await saveRooms(updated);
    setRenameTarget(null); setRenameText('');
  };

  // ── 방 나가기 ───────────────────────────────────────────────
  const handleLeave = (room) => {
    Alert.alert('방 나가기', `"${room.customName || room.roomCode}" 방을 목록에서 제거할까요?`, [
      { text: '취소' },
      { text: '나가기', style: 'destructive', onPress: async () => {
        const updated = rooms.filter(r => r.roomCode !== room.roomCode);
        setRooms(updated);
        await saveRooms(updated);
      }},
    ]);
  };

  return (
    <View style={s.root}>
      {/* 헤더 */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>채팅방</Text>
          <Text style={s.headerSub}>{me?.nick || ''}</Text>
        </View>
        <View style={s.themeRow}>
          <Text style={s.themeLabel}>{theme.mode === 'dark' ? '🌙' : '☀️'}</Text>
          <Switch
            value={theme.mode === 'light'}
            onValueChange={toggleTheme}
            trackColor={{ false: '#3a3a4a', true: '#c8c4ff' }}
            thumbColor={theme.accent}
          />
        </View>
        <View style={s.meAvatar}>
          {me?.photoURL
            ? <Image source={{ uri: me.photoURL }} style={{ width: 32, height: 32, borderRadius: 16 }}/>
            : <Text style={{ fontSize: 16 }}>{me?.emoji || '🐱'}</Text>}
        </View>
      </View>

      {/* 방 목록 */}
      {rooms.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>💬</Text>
          <Text style={s.emptyTitle}>채팅방이 없어요</Text>
          <Text style={s.emptySub}>새 방을 만들거나 코드로 입장해보세요</Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={r => r.roomCode}
          renderItem={({ item }) => (
            <RoomCard
              room={item}
              me={me}
              theme={theme}
              onEnter={onEnterRoom}
              onRename={(r) => { setRenameTarget(r); setRenameText(r.customName || ''); }}
              onLeave={handleLeave}
            />
          )}
          contentContainerStyle={{ paddingVertical: 8 }}
          showsVerticalScrollIndicator={false}
          onRefresh={loadRooms}
          refreshing={false}
        />
      )}

      {/* 하단 버튼 */}
      <View style={s.bottomBar}>
        <TouchableOpacity style={[s.bottomBtn, { backgroundColor: theme.bg3 }]}
          onPress={() => setNewCodeVisible(true)}>
          <Text style={s.bottomBtnTxt}>🔑  코드로 입장</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.bottomBtn, { backgroundColor: theme.accent }]}
          onPress={onGoSetup}>
          <Text style={[s.bottomBtnTxt, { color: '#fff' }]}>＋  새 방 만들기</Text>
        </TouchableOpacity>
      </View>

      {/* 이름 변경 모달 */}
      <Modal visible={!!renameTarget} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>방 이름 변경</Text>
            <Text style={s.modalSub}>나에게만 보이는 이름이에요</Text>
            <TextInput
              style={s.modalInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder={renameTarget?.roomCode}
              placeholderTextColor={theme.text3}
              autoFocus
              maxLength={20}
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: theme.bg3 }]} onPress={() => setRenameTarget(null)}>
                <Text style={[s.modalBtnTxt, { color: theme.text2 }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: theme.accent }]} onPress={handleRename}>
                <Text style={[s.modalBtnTxt, { color: '#fff' }]}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 코드 입장 모달 */}
      <Modal visible={newCodeVisible} transparent animationType="fade" onRequestClose={() => setNewCodeVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>방 코드로 입장</Text>
            <TextInput
              style={[s.modalInput, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 4, fontSize: 18 }]}
              value={newCode}
              onChangeText={t => setNewCode(t.toUpperCase())}
              placeholder="XXXXXX"
              placeholderTextColor={theme.text3}
              autoCapitalize="characters"
              maxLength={6}
              autoFocus
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: theme.bg3 }]}
                onPress={() => { setNewCodeVisible(false); setNewCode(''); }}>
                <Text style={[s.modalBtnTxt, { color: theme.text2 }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { backgroundColor: theme.accent, opacity: joining ? 0.6 : 1 }]}
                onPress={() => addRoom(newCode)} disabled={joining}>
                <Text style={[s.modalBtnTxt, { color: '#fff' }]}>{joining ? '확인 중...' : '입장'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingTop: Platform.OS === 'android' ? 44 : 56, paddingBottom: 14,
    backgroundColor: t.bg2, borderBottomWidth: 0.5, borderBottomColor: t.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: t.text },
  headerSub: { fontSize: 12, color: t.text3, marginTop: 1 },
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  themeLabel: { fontSize: 16 },
  meAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: t.bg3, alignItems: 'center', justifyContent: 'center',
    borderWidth: 0.5, borderColor: t.border2, overflow: 'hidden',
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 0.5, borderBottomColor: t.border,
    backgroundColor: t.bg2,
  },
  cardAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: t.bg3, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 15, fontWeight: '600', color: t.text },
  cardSub: { fontSize: 12, color: t.text3, marginTop: 2 },
  cardTime: { fontSize: 11, color: t.text3 },
  cardAction: { fontSize: 12, color: t.accent },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: t.text },
  emptySub: { fontSize: 13, color: t.text3 },
  bottomBar: {
    flexDirection: 'row', gap: 10, padding: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    backgroundColor: t.bg2, borderTopWidth: 0.5, borderTopColor: t.border,
  },
  bottomBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bottomBtnTxt: { fontSize: 14, fontWeight: '600', color: t.text },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalBox: { width: '100%', backgroundColor: t.bg2, borderRadius: 16, padding: 24, gap: 14, borderWidth: 0.5, borderColor: t.border2 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: t.text },
  modalSub: { fontSize: 12, color: t.text3, marginTop: -8 },
  modalInput: { backgroundColor: t.bg3, borderWidth: 0.5, borderColor: t.border, borderRadius: 10, padding: 12, color: t.text, fontSize: 15 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnTxt: { fontSize: 14, fontWeight: '600' },
});
