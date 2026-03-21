import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// 👇 기존 duo-chat 웹의 firebase.js 에서 복사한 값 그대로 넣으세요
  const firebaseConfig = {
    apiKey: "AIzaSyDLzsa37QPjX5CJxwOTdta3oSoFpwnHUTU",
    authDomain: "duo-chat-cd366.firebaseapp.com",
    projectId: "duo-chat-cd366",
    storageBucket: "duo-chat-cd366.firebasestorage.app",
    messagingSenderId: "598005308732",
    appId: "1:598005308732:web:c354da096176e5e628d239"
  };


const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
