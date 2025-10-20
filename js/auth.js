// auth.js
// Google 로그인/로그아웃 + 도메인 가드(클라이언트 측) + UI 반영

import { auth, provider } from "./firebase-init.js";
import {
  signInWithPopup, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// 허용 도메인(필요 시 수정)
const ALLOWED_DOMAIN = "ahnlab.com";

function setAuthUserText(text) {
  const el = document.getElementById("auth-user");
  if (el) el.textContent = text;
}

function setAuthButtons(signedIn) {
  const login = document.getElementById("btn-login");
  const logout = document.getElementById("btn-logout");
  if (login && logout) {
    login.classList.toggle("hidden", !!signedIn);
    logout.classList.toggle("hidden", !signedIn);
  }
}

export function initAuth(onReady) {
  // 상태 변화 감시
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const email = user.email || "";
      const ok = email.endsWith(`@${ALLOWED_DOMAIN}`);
      if (!ok) {
        // 허용 도메인 아니면 강제 로그아웃
        alert(`허용되지 않은 도메인입니다: ${email}`);
        await signOut(auth);
        setAuthUserText("로그인 필요");
        setAuthButtons(false);
        onReady(null);
        return;
      }
      setAuthUserText(`${user.displayName || email}`);
      setAuthButtons(true);
      onReady(user);
    } else {
      setAuthUserText("로그인 필요");
      setAuthButtons(false);
      onReady(null);
    }
  });

  // 버튼
  const btnLogin = document.getElementById("btn-login");
  if (btnLogin) {
    btnLogin.onclick = async () => {
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        alert("로그인 실패");
      }
    };
  }
  const btnLogout = document.getElementById("btn-logout");
  if (btnLogout) {
    btnLogout.onclick = async () => {
      try {
        await signOut(auth);
      } catch {}
    };
  }
}