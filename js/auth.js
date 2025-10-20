/**
 * 인증/세션 관리.
 * - 이메일/비번 로그인(간단)
 * - 로그아웃
 * - onAuthStateChanged 로 사용자 팀 스코프 결정
 */
import { auth, db } from './firebase-init.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const overlayId = 'login-overlay';

function ensureLoginOverlay() {
  if (document.getElementById(overlayId)) return;
  const overlay = document.createElement('div');
  overlay.id = overlayId;
  overlay.className = 'login-overlay';
  overlay.innerHTML = `
    <div class="login-card">
      <h2>로그인</h2>
      <p class="text-sm text-gray-600 mb-4">사내 계정(테스트용 이메일/비밀번호)을 입력하세요.</p>
      <form id="login-form" class="space-y-3">
        <div>
          <label class="text-sm text-gray-700">이메일</label>
          <input id="login-email" type="email" required class="mt-1 w-full border rounded px-3 py-2">
        </div>
        <div>
          <label class="text-sm text-gray-700">비밀번호</label>
          <input id="login-password" type="password" required class="mt-1 w-full border rounded px-3 py-2">
        </div>
        <button class="w-full bg-[#1173d4] text-white font-semibold rounded py-2" type="submit">로그인</button>
      </form>
      <p id="login-error" class="text-sm text-red-600 mt-3 hidden"></p>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = /** @type {HTMLInputElement} */(document.getElementById('login-email')).value.trim();
    const pw = /** @type {HTMLInputElement} */(document.getElementById('login-password')).value;
    const err = document.getElementById('login-error');
    err.classList.add('hidden');
    try {
      await signInWithEmailAndPassword(auth, email, pw);
    } catch (e) {
      err.textContent = '로그인 실패: ' + (e?.message ?? '확인 필요');
      err.classList.remove('hidden');
    }
  });
}

export function showLogin() {
  ensureLoginOverlay();
  document.getElementById(overlayId).style.display = 'flex';
}
export function hideLogin() {
  const el = document.getElementById(overlayId);
  if (el) el.style.display = 'none';
}

export async function fetchUserProfile(uid) {
  // /users/{uid}: {displayName, email, teamId, role}
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export function listenAuth(callback) {
  // callback({ user, profile }) 로 통지
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({ user: null, profile: null });
      showLogin();
      return;
    }
    hideLogin();
    const profile = await fetchUserProfile(user.uid);
    callback({ user, profile });
  });
}

export async function doLogout() {
  await signOut(auth);
