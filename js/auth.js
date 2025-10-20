// js/auth.js
import { auth, googleProvider, db } from "./firebase.js";
import {
  signInWithEmailAndPassword, signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

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
let currentTeams = [];   // 팀 권한(없어도 동작)
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
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), pwInput.value);
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

// user_teams 없어도 앱은 동작해야 함
async function loadUserTeams(uid) {
  try {
    const snap = await getDoc(doc(db, "user_teams", uid));
    if (snap.exists()) {
      const data = snap.data();
      currentTeams = Array.isArray(data.teams) ? data.teams : [];
    } else {
      currentTeams = [];
    }
  } catch (err) {
    console.warn("loadUserTeams error (무시):", err);
    currentTeams = [];
  }
}

async function loadIsAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, "admins", uid));
    isAdminUser = snap.exists();
  } catch (err) {
    console.warn("loadIsAdmin error (무시):", err);
    isAdminUser = false;
  }
}

export async function requireAuthAndTeams() {
  return { currentUser, currentTeams, isAdmin: isAdminUser };
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await Promise.all([loadUserTeams(user.uid), loadIsAdmin(user.uid)]);
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    sidebar.classList.remove("hidden");
    document.getElementById("signed-in-profile").classList.remove("hidden");
    userEmailEl.textContent = user.email || "(이메일 없음)";
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
