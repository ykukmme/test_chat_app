# DuoChat — 완전 설치 가이드

React Native (Expo) + Firebase 기반 1:1 채팅 앱입니다.

---

## 준비물 체크리스트

- [ ] Node.js 18 이상 ([nodejs.org](https://nodejs.org))
- [ ] 스마트폰에 **Expo Go** 앱 설치 (Play 스토어 무료)
- [ ] Firebase 계정 ([console.firebase.google.com](https://console.firebase.google.com))
- [ ] Expo 계정 ([expo.dev](https://expo.dev)) — APK 빌드 시 필요

---

## 1단계 — Firebase 프로젝트 설정

### 1-1. Firestore Database 활성화
1. Firebase 콘솔 → 프로젝트 선택
2. 왼쪽 메뉴 **Firestore Database** → "데이터베이스 만들기"
3. **테스트 모드**로 시작 → 위치: `asia-northeast3 (서울)` → 완료

### 1-2. Firestore 보안 규칙 설정
Firestore → **규칙** 탭 → 아래 내용으로 교체 후 **게시**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### 1-3. Storage 활성화
1. 왼쪽 메뉴 **Storage** → "시작하기"
2. **테스트 모드** → 위치는 Firestore와 동일하게 → 완료

### 1-4. Storage 보안 규칙 설정
Storage → **규칙** 탭 → 아래 내용으로 교체 후 **게시**:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

### 1-5. Firebase 설정값 앱에 입력
1. Firebase 콘솔 → 프로젝트 설정(톱니바퀴 아이콘)
2. "앱 추가" → 웹(`</>`) 선택
3. 앱 닉네임 입력 → 앱 등록
4. 표시되는 `firebaseConfig` 값 복사

`src/firebase.js` 파일 열고 아래 부분 교체:

```js
const firebaseConfig = {
  apiKey: "여기에 붙여넣기",
  authDomain: "여기에 붙여넣기",
  projectId: "여기에 붙여넣기",
  storageBucket: "여기에 붙여넣기",
  messagingSenderId: "여기에 붙여넣기",
  appId: "여기에 붙여넣기"
};
```

---

## 2단계 — 푸시 알림 설정 (안 하면 알림 안 옴)

푸시 알림은 두 가지가 모두 설정되어야 작동합니다.

### 2-1. google-services.json 추가 (FCM 연동)
1. Firebase 콘솔 → 프로젝트 설정 → **앱 추가** → Android 선택
2. 패키지 이름: `com.duochat.app` 입력 → 앱 등록
3. `google-services.json` 다운로드
4. 다운받은 파일을 프로젝트 **루트 폴더**에 복사:

```
duo-chat-app/
  google-services.json   ← 여기에 넣기
  app.json
  App.js
  src/
  ...
```

### 2-2. Expo Project ID 설정 (토큰 발급 필수)
1. [expo.dev](https://expo.dev) → 로그인
2. 새 프로젝트 만들기 또는 기존 프로젝트 선택
3. 프로젝트 대시보드에서 **Project ID** 복사 (형식: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
4. `app.json` 파일 열고 아래 부분 수정:

```json
"extra": {
  "eas": {
    "projectId": "여기에-복사한-Project-ID-붙여넣기"
  }
}
```

> **중요:** 이 값이 `"YOUR_EXPO_PROJECT_ID"` 그대로면 APK에서 알림이 절대 안 옵니다.

### 2-3. FCM 서버 키를 Expo에 등록
Expo의 알림 서버가 FCM을 통해 안드로이드 기기에 알림을 보내려면 서버 키 연결이 필요합니다.

1. Firebase 콘솔 → 프로젝트 설정 → **클라우드 메시징** 탭
2. **서버 키** 복사 (없으면 "새 서버 키 생성" 클릭)
3. 터미널에서 아래 명령어 실행:

```bash
eas credentials
```

4. Android → 프로젝트 선택 → `Push Notifications (FCM)` → `Upload FCM V1 service account key` 선택
5. Firebase 콘솔 → 프로젝트 설정 → **서비스 계정** 탭 → "새 비공개 키 생성" → JSON 파일 다운로드
6. 해당 JSON 파일 경로 입력

---

## 3단계 — 앱 실행 (Expo Go로 테스트)

```bash
# 프로젝트 폴더에서 터미널 열기
npm install

# 앱 시작
npm start
```

터미널에 QR 코드가 나타나면:
1. 안드로이드 폰에서 **Expo Go** 앱 열기
2. "Scan QR code" 탭 → QR 스캔
3. 앱 자동 실행

> **주의:** 폰과 PC가 **같은 Wi-Fi**에 연결되어 있어야 합니다.
> 같은 Wi-Fi가 없으면 `npm start` 후 `s`를 눌러 터널 모드로 전환하세요.

---

## 4단계 — APK 빌드 (실제 설치 파일)

Expo Go 없이 독립적으로 설치되는 APK 파일을 만들 때 사용합니다.

```bash
# EAS CLI 설치 (최초 1회)
npm install -g eas-cli

# Expo 계정 로그인
eas login

# 빌드 설정 초기화 (최초 1회, 물어보면 전부 엔터)
eas build:configure

# APK 빌드 시작 (약 10~15분, 클라우드에서 자동 빌드)
eas build --platform android --profile preview
```

빌드 완료 후 터미널 또는 [expo.dev](https://expo.dev) 대시보드에서 APK 다운로드 링크 확인.
다운받은 APK를 폰에 전송 후 설치하면 됩니다.

> **설치 시 "알 수 없는 출처" 경고가 뜨면:**
> 설정 → 보안 → 알 수 없는 출처 허용 → 파일 관리자 허용

---

## 앱 사용법

### 처음 시작
1. 닉네임 + 프로필 사진(또는 이모지) 설정
2. **방 만들기** → 생성된 6자리 코드를 상대방에게 전송
3. 상대방은 **방 입장** 탭에서 코드 입력

### 채팅방별 프로필 변경
각 채팅방마다 다른 이름과 프로필 사진을 사용할 수 있습니다.
- 채팅 화면 → 헤더 우측 **내 아바타(보라 테두리)** 탭
- 사진 또는 이모지, 닉네임 변경 → 저장
- **이 방에서만** 적용되고 다른 방에는 영향 없음
- "기본 프로필로 되돌리기" 버튼으로 초기 설정으로 복원 가능

---

## 기능 목록

| 기능 | 설명 |
|------|------|
| 여러 채팅방 | 방 목록에서 여러 방 관리 |
| 방 이름 변경 | 나에게만 보이는 커스텀 이름 설정 |
| 방별 커스텀 프로필 | 채팅방마다 다른 이름/사진 설정 가능 |
| 실시간 채팅 | Firebase Firestore 기반 즉시 동기화 |
| 메시지 전송 시간 | 말풍선 안 우하단에 HH:MM 표시 |
| 날짜 구분선 | 날짜 바뀌면 자동 표시 |
| 프로필 사진 | 갤러리 선택 또는 이모지 아바타 |
| 이미지/동영상/파일 전송 | 갤러리, 카메라, 파일 첨부 |
| 미디어 다운로드 | ⬇ 버튼으로 갤러리에 저장 |
| 이모지 반응 | 메시지 길게 누르기 → 반응 토글 |
| 온라인 상태 | 5분 이내 접속 시 온라인 표시 |
| 푸시 알림 + 진동 | 앱 꺼져 있어도 알림 수신 |
| 알림 탭 이동 | 알림 누르면 해당 채팅방으로 바로 이동 |
| 다크/라이트 테마 | 방 목록 우상단 스위치로 전환, 설정 유지 |
| 앱 재시작 후 자동 로그인 | 프로필 저장되어 재설정 불필요 |

---

## 문제 해결

| 문제 | 원인 | 해결 |
|------|------|------|
| 앱이 시작 안 됨 | 패키지 미설치 | `npm install` 후 재시도 |
| Firebase 연결 오류 | 설정값 오류 | `src/firebase.js` 값 재확인 |
| 이미지/파일 업로드 실패 | Storage 규칙 문제 | 1-4단계 Storage 규칙 재설정 |
| 메시지가 실시간으로 안 옴 | Firestore 규칙 문제 | 1-2단계 Firestore 규칙 재설정 |
| QR 코드 스캔 안 됨 | 네트워크 분리 | 같은 Wi-Fi 연결 확인, 또는 `s`눌러 터널 모드 |
| 푸시 알림이 안 옴 (Expo Go) | 정상 동작 | Expo Go에서는 알림이 제한적. APK 빌드 후 테스트 |
| 푸시 알림이 안 옴 (APK) | Project ID 미설정 | 2-2단계: `app.json`에 Expo Project ID 입력 |
| 푸시 알림이 안 옴 (APK) | FCM 키 미연동 | 2-3단계: EAS에 FCM 서비스 계정 키 등록 |
| 알림은 오는데 탭해도 앱 안 열림 | 정상 (첫 설치 후) | 앱을 한 번 실행 후 백그라운드 상태에서 테스트 |
| "이미 2명이 입장한 방" 오류 | 재입장 시 ID 불일치 | 앱 삭제 후 재설치하면 새 프로필로 입장 가능 |
| 방 목록이 비어 있음 | 로컬 저장 초기화 | 앱 삭제/재설치 또는 새 방 만들기 |
| 빌드 오류: SDK version | Expo 버전 불일치 | `npx expo install --check` 실행 |
| `crypto.getRandomValues` 오류 | uuid 패키지 잔재 | `node_modules` 삭제 후 `npm install` 재실행 |
