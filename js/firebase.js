// js/firebase.js
// Firebase 초기화 및 공용 인스턴스 export

import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

// window.__firebaseModules 는 index.html에서 로딩됨
const { initializeApp, getAnalytics } = window.__firebaseModules;

// *** 제공받은 구성 (공개 키지만, 보안은 Firestore Rules로 제어해야 함) ***
const firebaseConfig = {
  apiKey: "AIzaSyB9dXAXND3T7TT88mYK8c9a7EOueDReX6A",
  authDomain: "hr-managing-dashboard.firebaseapp.com",
  projectId: "hr-managing-dashboard",
  storageBucket: "hr-managing-dashboard.firebasestorage.app",
  messagingSenderId: "141526370741",
  appId: "1:141526370741:web:1e730fa3aeb987688071fc",
  measurementId: "G-TG3115500Z"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// 모듈 export
export { app, analytics, auth, db, googleProvider };
