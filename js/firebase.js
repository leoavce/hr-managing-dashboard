// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

// 제공된 설정 사용
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
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, db, googleProvider };
