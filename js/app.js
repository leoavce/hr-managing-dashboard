/**
 * 엔트리 포인트
 * - 인증 상태에 따라 라우팅/렌더링
 * - 사이드바 이벤트 바인딩
 * - 기본 라우트: 캘린더
 */
import './firebase-init.js';
import { listenAuth, doLogout } from './auth.js';
import { renderCalendarView } from './calendar.js';
import { renderManMonthView } from './manmonth.js';
import { renderHRView } from './hr.js';
import { mountSidebarNavigation, renderInMain, Routes, setActiveRoute } from './ui.js';

import '../css/styles.css'; // GitHub Pages에선 상대경로 주의: 루트 기준 배포 시 제거해도 무방(HTML link로 대체 가능)

/* 사이드바 네비 연결 */
mountSidebarNavigation((hash) => {
  setActiveRoute(hash);
  route(hash);
});

/* 우상단에 로그아웃 버튼 동적 주입(필요 시) */
function injectLogout() {
  const aside = document.querySelector('aside .p-6');
  if (!aside || aside.querySelector('#logout-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'logout-btn';
  btn.className = 'mt-3 text-xs text-gray-500 hover:underline';
  btn.textContent = '로그아웃';
  btn.addEventListener('click', doLogout);
  aside.appendChild(btn);
}

function route(hash, profile) {
  // 라우트별 뷰 교체
  const h = hash || window.location.hash || Routes.CALENDAR;
  let view;
  if (h === Routes.MANMONTH) {
    view = renderManMonthView(profile);
  } else if (h === Routes.HR) {
    view = renderHRView(profile);
  } else {
    view = renderCalendarView(profile);
  }
  renderInMain(view);
}

listenAuth(({ user, profile }) => {
  if (!user) return; // 로그인 오버레이가 표시됨
  injectLogout();
  // 최초 진입: 기본 캘린더
  route(window.location.hash || Routes.CALENDAR, profile);
});

// 해시 변경 대응
window.addEventListener('hashchange', () => route(window.location.hash));
