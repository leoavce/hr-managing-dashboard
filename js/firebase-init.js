// Firebase 초기화 (모듈 SDK). index.html 하단에서 js/app.js를 module로 로드해야 합니다.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
// analytics는 GitHub Pages(정적)에서도 동작하나 필수는 아님. 보안상 생략 가능.

const firebaseConfig = {
  apiKey: "AIzaSyB9dXAXND3T7TT88mYK8c9a7EOueDReX6A",
  authDomain: "hr-managing-dashboard.firebaseapp.com",
  projectId: "hr-managing-dashboard",
  storageBucket: "hr-managing-dashboard.firebasestorage.app",
  messagingSenderId: "141526370741",
  appId: "1:141526370741:web:1e730fa3aeb987688071fc",
  measurementId: "G-TG3115500Z"
};

// Firebase 앱/서비스 핸들 export
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app)
