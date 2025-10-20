// js/auth.js
// Firebase Auth UI 로직 및 세션 제어 (admins/{uid} 읽기 허용 규칙에 맞춰 동작)

import { auth, googleProvider, db } from "./firebase.js";
import {
  signInWithEmailAndPassword, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

const authView = document.getElementById("auth-view");
const appView = document.getElementById("app-view");
const sidebar = document.getElementById("sidebar");
const pageTitle = document.getElementById("page-title");
const pageContainer = document.getElementById("page-container");
const userEmailEl = document.getElementById("user-email");
const signoutBtn = document.getElementById("signout-btn");
const banner = document.getElementById("app-banner");

const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const pwInput = document.getElementById("login-password");
const googleBtn = document.getElementById("google-btn");

let currentUser = null;
let currentTeams = [];   // 접속 사용자가 볼 수 있는 팀 리스트
let isAdminUser = false; // 관리자 여부

function showBanner(msg, type="info") {
  banner.className = `w-full p-2 text-sm ${type === "error" ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"}`;
  banner.textContent = msg;
  banner.classList.remove("hidden");
  setTimeout(()=> banner.classList.add("hidden"), 4000);
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const email = emailInput.value.trim();
    const pw = pwInput.value;
    await signInWithEmailAndPassword(auth, email, pw);
  } catch (err) {
    console.error(err);
    showBanner("로그인 실패: 이메일/비밀번호를 확인하세요.", "error");
  }
});

googleBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    console.error(err);
    showBanner("Google 로그인 실패", "error");
  }
});

signoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error(err);
    showBanner("로그아웃 오류", "error");
  }
});

// 사용자 권한(팀) 로드
async function loadUserTeams(uid) {
  try {
    const ref = doc(db, "user_teams", uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      currentTeams = Array.isArray(data.teams) ? data.teams : [];
      if (!currentTeams.length) {
        showBanner("팀 권한이 비어 있습니다. 관리자에게 문의하세요.", "error");
      }
    } else {
      currentTeams = [];
      showBanner("팀 권한(user_teams)이 설정되지 않았습니다. 관리자에게 문의하세요.", "error");
    }
  } catch (err) {
    console.error(err);
    currentTeams = [];
    showBanner("권한 오류: 팀 권한 문서를 읽을 수 없습니다.", "error");
  }
}

// 관리자 여부 로드 (본인 admins/{uid} 읽기 허용 규칙 적용)
async function loadIsAdmin(uid) {
  try {
    const ref = doc(db, "admins", uid);
    const snap = await getDoc(ref);
    isAdminUser = snap.exists();
  } catch (err) {
    // 문서가 없으면 exists()도 false인데, 권한 오류가 난다면 rules가 아직 적용 안 됐을 가능성
    console.error(err);
    isAdminUser = false;
  }
}

// 라우팅에서 사용할 상태 제공
export async function requireAuthAndTeams() {
  return { currentUser, currentTeams, isAdmin: isAdminUser };
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await Promise.all([loadUserTeams(user.uid), loadIsAdmin(user.uid)]);

    // UI 전환
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    sidebar.classList.remove("hidden");
    document.getElementById("signed-in-profile").classList.remove("hidden");
    userEmailEl.textContent = user.email || "(이메일 없음)";

    // 초기 라우트
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    currentUser = null;
    currentTeams = [];
    isAdminUser = false;

    authView.classList.remove("hidden");
    appView.classList.add("hidden");
    sidebar.classList.add("hidden");
    document.getElementById("signed-in-profile").classList.add("hidden");
    userEmailEl.textContent = "";
    pageContainer.innerHTML = "";
    pageTitle.textContent = "로그인";
  }
});
