# DuoChat — 안드로이드 앱 설치 가이드

## 준비물
- Node.js 설치 (https://nodejs.org)
- 스마트폰에 **Expo Go** 앱 설치 (Play 스토어에서 무료)

---

## 1단계 — Firebase 설정값 입력

`src/firebase.js` 파일을 열고 기존 duo-chat 웹의 설정값을 그대로 붙여넣으세요.
(동일한 Firebase 프로젝트를 공유하므로 채팅방도 웹과 앱이 서로 연결됩니다!)

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

## 2단계 — 실행

```bash
# 이 폴더에서 터미널 열기
npm install
npm start
```

터미널에 QR 코드가 나타나면:
1. 안드로이드 폰에서 **Expo Go** 앱 열기
2. "Scan QR code" 탭 → QR 코드 스캔
3. 앱 자동 실행!

---

## 3단계 — APK로 빌드하기 (선택, 설치 파일 만들기)

```bash
# EAS CLI 설치
npm install -g eas-cli

# Expo 계정 로그인 (없으면 expo.dev에서 무료 가입)
eas login

# 빌드 설정 초기화
eas build:configure

# APK 빌드 (약 10~15분 소요)
eas build --platform android --profile preview
```

빌드 완료 후 다운로드 링크가 제공됩니다.
그 APK 파일을 폰에 전송 후 설치하면 됩니다.

---

## 기능 목록

| 기능 | 설명 |
|------|------|
| 프로필 사진 | 갤러리에서 사진 선택 또는 이모지 아바타 |
| 실시간 채팅 | Firebase 기반, 즉시 동기화 |
| **전송 시간** | 각 메시지마다 HH:MM 형식으로 표시 |
| 날짜 구분선 | 날짜가 바뀌면 '오늘', '3월 21일' 등으로 표시 |
| 이미지 전송 | 갤러리에서 선택 또는 카메라 촬영 |
| 동영상 전송 | 갤러리에서 선택 |
| 파일 전송 | PDF, ZIP 등 모든 파일 |
| 이모지 반응 | 메시지 길게 누르기 → 반응 추가 |
| 이미지 전체화면 | 이미지 탭하면 전체화면 보기 |
| 방 코드 복사 | 상단 코드 배지 탭 → 클립보드 복사 |

---

## 문제 해결

| 문제 | 해결 |
|------|------|
| 앱이 시작되지 않음 | `npm install` 후 다시 시도 |
| Firebase 연결 오류 | `src/firebase.js` 설정값 확인 |
| 이미지 업로드 실패 | Firebase Storage 규칙 확인 (duo-chat README 참고) |
| QR 코드 스캔 안됨 | 폰과 PC가 같은 Wi-Fi에 연결되어 있는지 확인 |
