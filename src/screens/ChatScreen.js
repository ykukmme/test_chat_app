import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  Image, KeyboardAvoidingView, Platform, Alert,
  Modal, Pressable, Dimensions, AppState, ScrollView, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';   // deprecated RN Clipboard 대체
import { Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { db, storage } from '../firebase';
import {
  collection, addDoc, query, orderBy, onSnapshot,
  serverTimestamp, doc, onSnapshot as onDocSnap, updateDoc, getDoc,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, uploadBytes, getDownloadURL } from 'firebase/storage';
import { generateId } from '../utils';
import { EMOJIS, REACT_EMOJIS } from '../theme';
import { useTheme } from '../context/ThemeContext';
import {
  registerForPushNotifications,
  sendPushNotification,
  vibrateOnMessage,
} from '../notifications';

const { width: SCREEN_W } = Dimensions.get('window');
const BUBBLE_MAX = SCREEN_W * 0.68;

const formatTime = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts * 1000);
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
};

const f2 = (n) => n.toString().padStart(2,'0');
const fmt = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts*1000);
  return f2(d.getHours())+':'+f2(d.getMinutes());
};
const fmtDate = (ts) => {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts*1000);
  if (d.toDateString()===new Date().toDateString()) return '오늘';
  return `${d.getMonth()+1}월 ${d.getDate()}일`;
};

// ── 텍스트 말풍선 ──
function TextBubble({ text, time, mine, theme, onLongPress }) {
  return (
    <TouchableOpacity onLongPress={onLongPress} activeOpacity={0.85}>
      <View style={{
        borderRadius:18, paddingHorizontal:12, paddingTop:8, paddingBottom:22,
        backgroundColor: mine ? theme.myBubble : theme.bubble,
        borderBottomRightRadius: mine ? 4 : 18,
        borderBottomLeftRadius:  mine ? 18 : 4,
      }}>
        <Text style={{ fontSize:14, lineHeight:20, color: mine ? theme.myBubbleTxt : theme.bubbleTxt }}>
          {text}{'  '}
          <Text style={{ fontSize:10, color:'transparent' }}>{time}</Text>
        </Text>
        <Text style={{ position:'absolute', bottom:6, right:10, fontSize:10, color: mine ? 'rgba(255,255,255,0.55)' : theme.text3 }}>
          {time}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── 미디어 말풍선 ──
const dlOverlay = { position:'absolute', bottom:0, left:0, right:0, flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'rgba(0,0,0,0.38)', paddingHorizontal:10, paddingVertical:5 };
const dlBtn = { backgroundColor:'rgba(255,255,255,0.2)', borderRadius:12, paddingHorizontal:8, paddingVertical:2 };

function MediaBubble({ msg, mine, theme, onPress, onDownload }) {
  const time = fmt(msg.createdAt);
  const border = { borderRadius:14, borderBottomRightRadius: mine?4:14, borderBottomLeftRadius: mine?14:4, overflow:'hidden' };
  if (msg.mediaType==='image') return (
    <TouchableOpacity onPress={onPress} onLongPress={onDownload} style={border}>
      <Image source={{ uri:msg.mediaURL }} style={{ width:SCREEN_W*0.58, height:SCREEN_W*0.44 }} resizeMode="cover"/>
      <View style={dlOverlay}>
        <TouchableOpacity onPress={onDownload} style={dlBtn}><Text style={{ fontSize:12, color:'#fff' }}>⬇</Text></TouchableOpacity>
        <Text style={{ fontSize:10, color:'#fff' }}>{time}</Text>
      </View>
    </TouchableOpacity>
  );
  if (msg.mediaType==='video') return (
    <View style={border}>
      <Video source={{ uri:msg.mediaURL }} style={{ width:SCREEN_W*0.58, height:SCREEN_W*0.44 }} useNativeControls resizeMode="cover"/>
      <View style={dlOverlay}>
        <TouchableOpacity onPress={onDownload} style={dlBtn}><Text style={{ fontSize:12, color:'#fff' }}>⬇</Text></TouchableOpacity>
        <Text style={{ fontSize:10, color:'#fff' }}>{time}</Text>
      </View>
    </View>
  );
  return (
    <TouchableOpacity onLongPress={onDownload} style={{ borderRadius:14, paddingHorizontal:14, paddingVertical:12, backgroundColor: mine?theme.myBubble:theme.bubble, flexDirection:'row', alignItems:'center', gap:10, borderBottomRightRadius:mine?4:14, borderBottomLeftRadius:mine?14:4 }}>
      <Text style={{ fontSize:24 }}>📎</Text>
      <View style={{ flex:1 }}>
        <Text style={{ fontSize:13, color: mine?theme.myBubbleTxt:theme.bubbleTxt }}>파일</Text>
        <Text style={{ fontSize:10, color: mine?'rgba(255,255,255,0.55)':theme.text3 }}>{time} · 길게 눌러 저장</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── 메시지 행 ──
function MessageRow({ msg, me, them, theme, onLongPress, onImagePress, onDownload, reactionOpen, onReactionAdd, onReactionToggle }) {
  const mine = msg.senderId === me.id;
  const sender = mine ? me : them;
  const reactions = msg.reactions || {};

  // 이모지 반응 토글: userId 배열로 관리 — 중복 방지 (버그 #5 수정)
  const hasReacted = (emoji) => (reactions[emoji] || []).includes(me.id);
  const reactionEntries = Object.entries(reactions).filter(([,arr]) => Array.isArray(arr) ? arr.length > 0 : arr > 0);

  const makeAvatar = (member, marginLeft=0, marginRight=0) => (
    <View style={{ width:30, height:30, borderRadius:15, backgroundColor:theme.bg3, alignItems:'center', justifyContent:'center', marginLeft, marginRight, flexShrink:0, overflow:'hidden' }}>
      {member?.photoURL
        ? <Image source={{ uri:member.photoURL }} style={{ width:30, height:30, borderRadius:15 }}/>
        : <Text style={{ fontSize:13 }}>{member?.emoji||'?'}</Text>}
    </View>
  );

  const bubble = msg.mediaURL
    ? <MediaBubble msg={msg} mine={mine} theme={theme} onPress={() => onImagePress(msg)} onDownload={() => onDownload(msg)}/>
    : <TextBubble text={msg.text} time={fmt(msg.createdAt)} mine={mine} theme={theme} onLongPress={() => onLongPress(msg.id)}/>;

  return (
    <View style={{ flexDirection:'row', alignItems:'flex-end', marginBottom:3, paddingHorizontal:2, justifyContent: mine?'flex-end':'flex-start' }}>
      {/* 상대방 아바타 — 왼쪽 */}
      {!mine && makeAvatar(them, 0, 6)}
      <View style={{ maxWidth:BUBBLE_MAX, flexShrink:1, alignItems: mine?'flex-end':'flex-start' }}>
        {bubble}
        {(reactionEntries.length > 0 || reactionOpen) && (
          <View style={{ flexDirection:'row', flexWrap:'wrap', gap:4, marginTop:3, alignItems:'center', justifyContent: mine?'flex-end':'flex-start' }}>
            {reactionEntries.map(([emoji, val]) => {
              const count = Array.isArray(val) ? val.length : val;
              const reacted = hasReacted(emoji);
              return (
                <TouchableOpacity key={emoji} onPress={() => onReactionAdd(msg.id, emoji)}
                  style={{ paddingHorizontal:8, paddingVertical:2, borderRadius:20,
                    backgroundColor: reacted ? theme.accentBg : theme.bg3,
                    borderWidth:0.5, borderColor: reacted ? theme.accent : theme.border }}>
                  <Text style={{ fontSize:12, color: reacted ? theme.accent2 : theme.text2 }}>{emoji} {count}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity onPress={() => onReactionToggle(msg.id)}
              style={{ paddingHorizontal:7, paddingVertical:2, borderRadius:20, borderWidth:0.5, borderColor:theme.border }}>
              <Text style={{ fontSize:13, color:theme.text3 }}>+</Text>
            </TouchableOpacity>
            {reactionOpen && (
              <View style={{ flexDirection:'row', gap:2, padding:6, backgroundColor:theme.bg2, borderRadius:22, marginLeft:4, borderWidth:0.5, borderColor:theme.border2 }}>
                {REACT_EMOJIS.map(em => (
                  <TouchableOpacity key={em} onPress={() => onReactionAdd(msg.id, em)} style={{ padding:3 }}>
                    <Text style={{ fontSize:20 }}>{em}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
      {/* 내 아바타 — 오른쪽 */}
      {mine && makeAvatar(me, 6, 0)}
    </View>
  );
}

// ── 메인 ────────────────────────────────────────────────────
export default function ChatScreen({ session, onLeave }) {
  const { roomCode, me } = session;
  const { theme } = useTheme();

  const [messages, setMessages] = useState([]);
  const [them, setThem] = useState(null);
  const [theirToken, setTheirToken] = useState(null);
  const [isOnline, setIsOnline] = useState(false);  // 실제 온라인 상태
  const [text, setText] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [reactionTarget, setReactionTarget] = useState(null);
  const flatRef = useRef();
  const meIdRef = useRef(me.id);

  // ── 프로필 수정 상태 ────────────────────────────────────────
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editNick, setEditNick] = useState(me.nick);
  const [editEmoji, setEditEmoji] = useState(me.emoji || '🐱');
  const [editAvatarUri, setEditAvatarUri] = useState(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState(me.photoURL || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentMe, setCurrentMe] = useState(me); // 로컬 me 상태 (수정 후 즉시 반영)

  // 방별 프로필 로드 — 이 방에서 커스텀 프로필을 설정한 적 있으면 우선 적용
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('room_profile_' + roomCode);
        if (raw) {
          const roomProfile = JSON.parse(raw);
          if (roomProfile.id === me.id) {
            setCurrentMe(roomProfile);
            setEditNick(roomProfile.nick);
            setEditEmoji(roomProfile.emoji || '🐱');
            setEditAvatarPreview(roomProfile.photoURL || '');
          }
        }
      } catch (e) {}
    })();
  }, [roomCode]);

  // 푸시 토큰 등록
  useEffect(() => {
    registerForPushNotifications(roomCode, me.id);
  }, []);

  // lastSeen 업데이트 (앱 포/백그라운드 전환 시)
  useEffect(() => {
    const updateLastSeen = async () => {
      try {
        await updateDoc(doc(db, 'rooms', roomCode), {
          [`lastSeen.${me.id}`]: Date.now(),
        });
      } catch(e) {}
    };
    updateLastSeen();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') updateLastSeen();
    });
    return () => sub.remove();
  }, []);

  // 방 멤버 + 온라인 상태 구독 (버그 #1 수정 — lastSeen 기반)
  useEffect(() => {
    return onDocSnap(doc(db, 'rooms', roomCode), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      const other = (data.members || []).find(m => m.id !== me.id);
      if (other) setThem(other);
      const tokens = data.pushTokens || {};
      const tok = Object.entries(tokens).find(([id]) => id !== me.id)?.[1];
      if (tok) setTheirToken(tok);
      // 5분 이내 lastSeen이면 온라인으로 판정
      const lastSeen = data.lastSeen || {};
      const theirSeen = other ? lastSeen[other.id] : null;
      setIsOnline(theirSeen ? (Date.now() - theirSeen) < 5 * 60 * 1000 : false);
    });
  }, [roomCode]);

  // 메시지 구독 — 내 메시지엔 진동 안 울림 (버그 #4 수정)
  useEffect(() => {
    const q = query(collection(db, 'rooms', roomCode, 'messages'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMessages(prev => {
        if (prev.length > 0 && msgs.length > prev.length) {
          const newest = msgs[msgs.length - 1];
          if (newest.senderId !== meIdRef.current) {
            vibrateOnMessage();  // 상대방 메시지일 때만 진동
          }
        }
        return msgs;
      });
    });
  }, [roomCode]);

  // 새 메시지 시 스크롤
  useEffect(() => {
    if (messages.length > 0) setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length]);

  // ── 파일 업로드 ──
  const uploadFile = async (uri, mimeType) => {
    const ext = uri.split('.').pop().split('?')[0] || 'bin';
    const storageRef = ref(storage, `media/${roomCode}/${generateId()}.${ext}`);
    const blob = await (await fetch(uri)).blob();
    return new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, blob, { contentType: mimeType });
      task.on('state_changed',
        s => setUploadProgress(Math.round(s.bytesTransferred / s.totalBytes * 100)),
        reject,
        async () => resolve(await getDownloadURL(task.snapshot.ref))
      );
    });
  };

  // ── 메시지 전송 — 실패 시 텍스트 복원 (버그 #6 수정) ──
  const sendMessage = async (mediaURL = '', mediaType = '') => {
    if (!text.trim() && !mediaURL) return;
    const msgText = text.trim();
    setText('');
    setEmojiOpen(false);
    setMediaOpen(false);
    const msgData = {
      senderId: me.id, senderNick: currentMe.nick,
      text: msgText, mediaURL, mediaType,
      reactions: {}, createdAt: serverTimestamp(),
    };
    try {
      await addDoc(collection(db, 'rooms', roomCode, 'messages'), msgData);
      if (theirToken) await sendPushNotification(theirToken, currentMe.nick, { ...msgData, roomCode });
    } catch (e) {
      // 전송 실패 시 텍스트 복원
      if (msgText) setText(msgText);
      Alert.alert('전송 실패', '다시 시도해주세요');
    }
  };

  // ── 미디어 선택 — uploading 상태 finally에서 정리 (버그 #3 수정) ──
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('갤러리 권한이 필요해요'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setUploadingFile(true); setMediaOpen(false);
    try {
      const url = await uploadFile(asset.uri, asset.mimeType || 'image/jpeg');
      await sendMessage(url, asset.type === 'video' ? 'video' : 'image');
    } catch (e) {
      Alert.alert('업로드 실패', e.message);
    } finally {
      setUploadingFile(false); setUploadProgress(0);  // finally에서만 정리
    }
  };

  const pickCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('카메라 권한이 필요해요'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled) return;
    setUploadingFile(true); setMediaOpen(false);
    try {
      const url = await uploadFile(result.assets[0].uri, 'image/jpeg');
      await sendMessage(url, 'image');
    } catch (e) {
      Alert.alert('업로드 실패', e.message);
    } finally {
      setUploadingFile(false); setUploadProgress(0);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    const file = result.assets[0];
    setUploadingFile(true); setMediaOpen(false);
    try {
      const url = await uploadFile(file.uri, file.mimeType || 'application/octet-stream');
      await sendMessage(url, 'file');
    } catch (e) {
      Alert.alert('업로드 실패', e.message);
    } finally {
      setUploadingFile(false); setUploadProgress(0);
    }
  };

  // ── 이모지 반응 — userId 배열로 토글 (버그 #5 수정) ──
  const addReaction = async (msgId, emoji) => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;
    const reactions = { ...(msg.reactions || {}) };
    const current = reactions[emoji];
    // 기존 방식(숫자) 호환 + 신규 방식(배열)
    if (Array.isArray(current)) {
      if (current.includes(me.id)) {
        reactions[emoji] = current.filter(id => id !== me.id); // 취소
      } else {
        reactions[emoji] = [...current, me.id]; // 추가
      }
    } else {
      reactions[emoji] = [me.id]; // 신규
    }
    await updateDoc(doc(db, 'rooms', roomCode, 'messages', msgId), { reactions });
    setReactionTarget(null);
  };

  // ── 미디어 다운로드 ──
  const downloadMedia = async (msg) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('저장 권한이 필요해요'); return; }
      const ext = msg.mediaType === 'image' ? 'jpg' : msg.mediaType === 'video' ? 'mp4' : 'bin';
      const dest = FileSystem.documentDirectory + `duochat_${Date.now()}.${ext}`;
      const { uri } = await FileSystem.downloadAsync(msg.mediaURL || msg.url, dest);
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('저장됨', '갤러리에 저장됐어요!');
    } catch (e) {
      Alert.alert('다운로드 실패', e.message);
    }
  };

  // ── 날짜 구분선 삽입 ──
  const listData = messages.reduce((acc, msg, i) => {
    const prev = messages[i - 1];
    if (!prev || fmtDate(msg.createdAt) !== fmtDate(prev.createdAt))
      acc.push({ type: 'date', label: fmtDate(msg.createdAt), key: 'date-' + i });
    acc.push({ type: 'msg', ...msg });
    return acc;
  }, []);

  const renderItem = ({ item }) => item.type === 'date'
    ? <View style={{ alignItems:'center', marginVertical:14 }}>
        <Text style={{ fontSize:12, color:theme.text3, backgroundColor:theme.bg2, paddingHorizontal:12, paddingVertical:4, borderRadius:12 }}>{item.label}</Text>
      </View>
    : <MessageRow msg={item} me={currentMe} them={them} theme={theme}
        onLongPress={id => setReactionTarget(reactionTarget === id ? null : id)}
        onImagePress={msg => setLightbox({ url: msg.mediaURL, type: msg.mediaType })}
        onDownload={downloadMedia}
        reactionOpen={reactionTarget === item.id}
        onReactionAdd={addReaction}
        onReactionToggle={id => setReactionTarget(reactionTarget === id ? null : id)} />;

  // ── 프로필 수정 ──────────────────────────────────────────
  const pickProfileImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('갤러리 권한이 필요해요'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1,1], quality: 0.7,
    });
    if (!result.canceled) {
      setEditAvatarUri(result.assets[0].uri);
      setEditAvatarPreview(result.assets[0].uri);
    }
  };

  const saveProfile = async () => {
    if (!editNick.trim()) { Alert.alert('닉네임을 입력해주세요'); return; }
    setSavingProfile(true);
    try {
      let photoURL = editAvatarPreview;

      // 새 사진 선택 시 방별 경로로 업로드 (전역 아바타와 분리)
      if (editAvatarUri) {
        const response = await fetch(editAvatarUri);
        const blob = await response.blob();
        // 방별 아바타: avatars/{userId}/{roomCode}
        const storageRef = ref(storage, `avatars/${currentMe.id}/${roomCode}`);
        await uploadBytes(storageRef, blob);
        photoURL = await getDownloadURL(storageRef);
      }

      const updatedMe = {
        ...currentMe,
        nick: editNick.trim(),
        emoji: editEmoji,
        photoURL,
      };

      // Firestore: 이 방의 members에서만 내 정보 업데이트
      const roomSnap = await getDoc(doc(db, 'rooms', roomCode));
      if (roomSnap.exists()) {
        const members = (roomSnap.data().members || []).map(m =>
          m.id === currentMe.id
            ? { ...m, nick: updatedMe.nick, emoji: updatedMe.emoji, photoURL: updatedMe.photoURL }
            : m
        );
        await updateDoc(doc(db, 'rooms', roomCode), { members });
      }

      // 방별 로컬 프로필 저장 (전역 my_profile_v1은 건드리지 않음)
      await AsyncStorage.setItem(
'room_profile_' + roomCode,
        JSON.stringify(updatedMe)
      );

      setCurrentMe(updatedMe);
      setEditAvatarUri(null);
      setProfileModalOpen(false);
      Alert.alert('저장됐어요!', '이 채팅방에서만 적용되는 프로필이에요.');
    } catch (e) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const copyCode = async () => {
    await Clipboard.setStringAsync(roomCode);  // expo-clipboard 사용 (버그 #7 수정)
    Alert.alert('복사됨!', `방 코드 ${roomCode}`);
  };

  return (
    <View style={{ flex:1, backgroundColor:theme.bg }}>
      {/* 헤더 */}
      <View style={{ flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:14, paddingTop:Platform.OS==='android'?44:54, paddingBottom:12, backgroundColor:theme.bg2, borderBottomWidth:0.5, borderBottomColor:theme.border }}>
        <TouchableOpacity onPress={() => Alert.alert('나가기','채팅방을 나가시겠어요?',[{text:'취소'},{text:'나가기',style:'destructive',onPress:onLeave}])} style={{ padding:4 }}>
          <Text style={{ fontSize:20, color:theme.accent }}>‹</Text>
        </TouchableOpacity>
        {/* 상대방 아바타 */}
        <View style={{ width:38, height:38, borderRadius:19, backgroundColor:theme.bg3, alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
          {them?.photoURL
            ? <Image source={{ uri:them.photoURL }} style={{ width:38, height:38, borderRadius:19 }}/>
            : <Text style={{ fontSize:20 }}>{them?.emoji||'👤'}</Text>}
        </View>
        <View style={{ flex:1 }}>
          <Text style={{ fontSize:15, fontWeight:'600', color:theme.text }}>{them?.nick||'상대방 기다리는 중...'}</Text>
          <View style={{ flexDirection:'row', alignItems:'center', gap:5 }}>
            <View style={{ width:6, height:6, borderRadius:3, backgroundColor: isOnline ? theme.green : theme.text3 }}/>
            <Text style={{ fontSize:12, color: isOnline ? theme.green : theme.text3 }}>{isOnline ? '온라인' : '오프라인'}</Text>
          </View>
        </View>
        <TouchableOpacity style={{ paddingHorizontal:9, paddingVertical:5, backgroundColor:theme.bg3, borderRadius:6, borderWidth:0.5, borderColor:theme.border }} onPress={copyCode}>
          <Text style={{ fontSize:11, color:theme.text2, letterSpacing:1, fontFamily:Platform.OS==='ios'?'Courier':'monospace' }}>{roomCode}</Text>
        </TouchableOpacity>
        {/* 내 아바타 — 탭하면 프로필 수정 */}
        <TouchableOpacity onPress={() => {
          setEditNick(currentMe.nick);
          setEditEmoji(currentMe.emoji || '🐱');
          setEditAvatarUri(null);
          setEditAvatarPreview(currentMe.photoURL || '');
          setProfileModalOpen(true);
        }} style={{ width:34, height:34, borderRadius:17, backgroundColor:theme.bg3, alignItems:'center', justifyContent:'center', overflow:'hidden', borderWidth:1.5, borderColor:theme.accent }}>
          {currentMe.photoURL
            ? <Image source={{ uri:currentMe.photoURL }} style={{ width:34, height:34, borderRadius:17 }}/>
            : <Text style={{ fontSize:17 }}>{currentMe.emoji||'🐱'}</Text>}
        </TouchableOpacity>
      </View>

      {uploadingFile && (
        <View style={{ height:2, backgroundColor:theme.bg4 }}>
          <View style={{ height:'100%', width:`${uploadProgress}%`, backgroundColor:theme.accent }}/>
        </View>
      )}

      {/* 메시지 */}
      {!them && messages.length === 0 ? (
        <View style={{ flex:1, alignItems:'center', justifyContent:'center', gap:14 }}>
          <Text style={{ fontSize:14, color:theme.text3 }}>상대방을 기다리고 있어요</Text>
          <TouchableOpacity onPress={copyCode}>
            <Text style={{ fontSize:26, fontWeight:'600', color:theme.text, letterSpacing:6, fontFamily:Platform.OS==='ios'?'Courier':'monospace', padding:16, backgroundColor:theme.bg3, borderRadius:12, borderWidth:0.5, borderColor:theme.border2 }}>{roomCode}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize:12, color:theme.text3 }}>코드를 탭하면 복사됩니다</Text>
        </View>
      ) : (
        <FlatList ref={flatRef} data={listData}
          keyExtractor={(item, i) => item.id || item.key || String(i)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingVertical:10, paddingHorizontal:8 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })} />
      )}

      {/* 이모지 피커 */}
      {emojiOpen && (
        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:4, padding:10, backgroundColor:theme.bg2, borderTopWidth:0.5, borderTopColor:theme.border }}>
          {EMOJIS.map(em => (
            <TouchableOpacity key={em} onPress={() => setText(t => t + em)} style={{ padding:4 }}>
              <Text style={{ fontSize:24 }}>{em}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 입력창 */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:10, paddingVertical:8, paddingBottom:Platform.OS==='ios'?24:8, backgroundColor:theme.bg2, borderTopWidth:0.5, borderTopColor:theme.border }}>
          <TouchableOpacity style={{ padding:6 }} onPress={() => { setEmojiOpen(o => !o); setMediaOpen(false); }}>
            <Text style={{ fontSize:22 }}>😊</Text>
          </TouchableOpacity>
          <TextInput
            style={{ flex:1, color:theme.text, fontSize:14, backgroundColor:theme.bg3, borderRadius:22, paddingHorizontal:14, paddingVertical:9, maxHeight:120, borderWidth:0.5, borderColor:theme.border }}
            value={text} onChangeText={setText}
            placeholder="메시지를 입력하세요..." placeholderTextColor={theme.text3}
            multiline
            onFocus={() => { setEmojiOpen(false); setMediaOpen(false); }}
          />
          <TouchableOpacity style={{ padding:6 }} onPress={() => { setMediaOpen(o => !o); setEmojiOpen(false); }}>
            <Text style={{ fontSize:20 }}>📎</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ width:36, height:36, borderRadius:18, backgroundColor:theme.accent, alignItems:'center', justifyContent:'center', opacity:(!text.trim()&&!uploadingFile)?0.35:1 }}
            onPress={() => sendMessage()}
            disabled={!text.trim() || uploadingFile}>
            <Text style={{ color:'#fff', fontSize:16 }}>➤</Text>
          </TouchableOpacity>
        </View>
        {mediaOpen && (
          <View style={{ flexDirection:'row', gap:12, padding:14, paddingBottom:Platform.OS==='ios'?22:14, backgroundColor:theme.bg2, borderTopWidth:0.5, borderTopColor:theme.border }}>
            {[{icon:'🖼️',label:'갤러리',fn:pickImage},{icon:'📷',label:'카메라',fn:pickCamera},{icon:'📄',label:'파일',fn:pickDocument}]
              .map(({ icon, label, fn }) => (
                <TouchableOpacity key={label} style={{ alignItems:'center', gap:5, flex:1 }} onPress={fn}>
                  <Text style={{ fontSize:26 }}>{icon}</Text>
                  <Text style={{ fontSize:12, color:theme.text2 }}>{label}</Text>
                </TouchableOpacity>
              ))}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ── 프로필 수정 모달 ─────────────────────────────── */}
      <Modal visible={profileModalOpen} transparent animationType="fade" onRequestClose={() => setProfileModalOpen(false)}>
        <Pressable style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'flex-end' }} onPress={() => setProfileModalOpen(false)}>
          <Pressable onPress={e => e.stopPropagation()}>
            <View style={{ backgroundColor:theme.bg2, borderTopLeftRadius:20, borderTopRightRadius:20, padding:24, gap:18 }}>
              {/* 핸들 */}
              <View style={{ width:40, height:4, borderRadius:2, backgroundColor:theme.bg4, alignSelf:'center', marginTop:-8 }}/>
              <Text style={{ fontSize:17, fontWeight:'600', color:theme.text, textAlign:'center' }}>이 방 프로필 수정</Text>
              <Text style={{ fontSize:12, color:theme.text3, textAlign:'center', marginTop:-10 }}>이 채팅방에서만 적용돼요</Text>

              {/* 기본 프로필로 되돌리기 */}
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await AsyncStorage.removeItem('room_profile_' + roomCode);
                    setCurrentMe(me);
                    setEditNick(me.nick);
                    setEditEmoji(me.emoji || '🐱');
                    setEditAvatarPreview(me.photoURL || '');
                    setEditAvatarUri(null);
                    // Firestore도 기본 프로필로 복원
                    const roomSnap = await getDoc(doc(db, 'rooms', roomCode));
                    if (roomSnap.exists()) {
                      const members = (roomSnap.data().members || []).map(m =>
                        m.id === me.id ? { ...m, nick: me.nick, emoji: me.emoji, photoURL: me.photoURL } : m
                      );
                      await updateDoc(doc(db, 'rooms', roomCode), { members });
                    }
                    setProfileModalOpen(false);
                    Alert.alert('복원됐어요', '기본 프로필로 돌아왔어요.');
                  } catch(e) {}
                }}
                style={{ alignSelf:'center', paddingVertical:5, paddingHorizontal:12, borderRadius:20, borderWidth:0.5, borderColor:theme.border }}>
                <Text style={{ fontSize:12, color:theme.text3 }}>기본 프로필로 되돌리기</Text>
              </TouchableOpacity>

              {/* 아바타 수정 */}
              <View style={{ alignItems:'center', gap:12 }}>
                <TouchableOpacity onPress={pickProfileImage} style={{ width:80, height:80, borderRadius:40, backgroundColor:theme.bg3, borderWidth:2, borderColor:theme.accent, alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                  {editAvatarPreview
                    ? <Image source={{ uri:editAvatarPreview }} style={{ width:80, height:80, borderRadius:40 }}/>
                    : <Text style={{ fontSize:36 }}>{editEmoji}</Text>}
                  <View style={{ position:'absolute', bottom:0, left:0, right:0, backgroundColor:'rgba(0,0,0,0.45)', paddingVertical:4, alignItems:'center' }}>
                    <Text style={{ fontSize:10, color:'#fff' }}>사진 변경</Text>
                  </View>
                </TouchableOpacity>

                {/* 이모지 선택 */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {['🐱','🐶','🦊','🐼','🐨','🦁','🐸','🐧','🦋','🌸'].map(e => (
                    <TouchableOpacity key={e} onPress={() => { setEditEmoji(e); setEditAvatarUri(null); setEditAvatarPreview(''); }}
                      style={{ padding:6, marginHorizontal:3, borderRadius:8, backgroundColor: editEmoji===e&&!editAvatarPreview ? theme.accentBg : 'transparent' }}>
                      <Text style={{ fontSize:26 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* 닉네임 입력 */}
              <View>
                <Text style={{ fontSize:11, fontWeight:'600', color:theme.text3, letterSpacing:0.8, textTransform:'uppercase', marginBottom:8 }}>닉네임</Text>
                <TextInput
                  style={{ backgroundColor:theme.bg3, borderWidth:0.5, borderColor:theme.border, borderRadius:10, padding:13, color:theme.text, fontSize:15 }}
                  value={editNick}
                  onChangeText={setEditNick}
                  placeholder="닉네임"
                  placeholderTextColor={theme.text3}
                  maxLength={12}
                />
              </View>

              {/* 버튼 */}
              <View style={{ flexDirection:'row', gap:10 }}>
                <TouchableOpacity style={{ flex:1, paddingVertical:13, backgroundColor:theme.bg3, borderRadius:10, alignItems:'center' }}
                  onPress={() => setProfileModalOpen(false)}>
                  <Text style={{ fontSize:15, fontWeight:'600', color:theme.text2 }}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex:1, paddingVertical:13, backgroundColor:theme.accent, borderRadius:10, alignItems:'center', opacity:savingProfile?0.6:1 }}
                  onPress={saveProfile} disabled={savingProfile}>
                  {savingProfile
                    ? <ActivityIndicator color="#fff" size="small"/>
                    : <Text style={{ fontSize:15, fontWeight:'600', color:'#fff' }}>저장</Text>}
                </TouchableOpacity>
              </View>
              <View style={{ height: Platform.OS==='ios'?20:0 }}/>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 라이트박스 */}
      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable style={{ flex:1, backgroundColor:'rgba(0,0,0,0.92)', alignItems:'center', justifyContent:'center' }} onPress={() => setLightbox(null)}>
          {lightbox?.type === 'video'
            ? <Video source={{ uri:lightbox.url }} style={{ width:SCREEN_W-24, height:SCREEN_W*1.1 }} useNativeControls resizeMode="contain"/>
            : lightbox && <Image source={{ uri:lightbox.url }} style={{ width:SCREEN_W-24, height:SCREEN_W*1.1 }} resizeMode="contain"/>}
          <TouchableOpacity style={{ position:'absolute', top:52, right:18, width:38, height:38, borderRadius:19, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center' }} onPress={() => setLightbox(null)}>
            <Text style={{ color:'#fff', fontSize:18 }}>✕</Text>
          </TouchableOpacity>
          {lightbox && (
            <TouchableOpacity style={{ position:'absolute', top:52, left:18, width:38, height:38, borderRadius:19, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center' }} onPress={() => downloadMedia(lightbox)}>
              <Text style={{ color:'#fff', fontSize:16 }}>⬇</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}
