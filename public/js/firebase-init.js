// firebase-init.js
// Firebase 초기화 모듈. 다른 모듈에서 import하여 사용.
// (주의) Analytics 사용은 내부 정책 검토 후 활성화.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// --- 사용자 제공 config ---
const firebaseConfig = {
  apiKey: "AIzaSyB9dXAXND3T7TT88mYK8c9a7EOueDReX6A",
  authDomain: "hr-managing-dashboard.firebaseapp.com",
  projectId: "hr-managing-dashboard",
  storageBucket: "hr-managing-dashboard.firebasestorage.app",
  messagingSenderId: "141526370741",
  appId: "1:141526370741:web:1e730fa3aeb987688071fc",
  measurementId: "G-TG3115500Z"
};

// --- init ---
const app = initializeApp(firebaseConfig);

// 내부망/프라이버시에 따라 Analytics는 비활성 권장 (필요 시 주석 해제)
// const analytics = getAnalytics(app);

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

export { app, auth, provider, db };