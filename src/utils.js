/**
 * React Native / Expo 환경에서 crypto.getRandomValues() 없이
 * 충분히 고유한 ID를 생성하는 유틸 함수
 */
export function generateId() {
  const timestamp = Date.now().toString(36);
  const rand1 = Math.random().toString(36).substring(2, 8);
  const rand2 = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${rand1}-${rand2}`;
}
