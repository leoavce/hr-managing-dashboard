// app.js
// 앱 엔트리: Auth → 상태 로드 → 라우팅/렌더/이벤트 바인딩

import { initAuth } from "./auth.js";
import {
  listEmployees, listAssignments, getPresets, listHolidays
} from "./api.js";
import { mountRouter, activateRoute } from "./router.js";
import { renderCalendar } from "./calendar.js";
import { mountManMonth } from "./manmonth.js";
import { mountHR, renderAssignTable } from "./hr.js";
import { importCsv } from "./csv.js";

const state = {
  employees: [],
  assignments: [],
  presets: { roles:[], tasks:[], members:[] },
  holidays: [],
  ui: {
    baseDate: (function(){ const d=new Date(); d.setHours(9,0,0,0); return d.toISOString().slice(0,10); })(),
    weekdays: []
  },
  reload: null // 뒤에서 주입
};

// 공통 로드
async function loadAll() {
  const [emp, asg, pre, hol] = await Promise.all([
    listEmployees(), listAssignments(), getPresets(), listHolidays()
  ]);
  state.employees = emp;
  state.assignments = asg;
  state.presets = pre || { roles:[], tasks:[], members:[] };
  state.holidays = hol || [];
}

function bindCommonUI() {
  // 다크 모드
  const btnDark = document.getElementById('btn-dark');
  if (btnDark) btnDark.onclick = () => document.documentElement.classList.toggle('dark');

  // CSV 업로드
  let csvText = '';
  const file = document.getElementById('csv-file');
  const target = document.getElementById('csv-target');
  const btn = document.getElementById('btn-import');
  if (file) file.onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return; csvText = await f.text();
    alert('CSV 업로드 준비 완료. "일괄 반영"을 눌러주세요.');
  };
  if (btn) btn.onclick = async () => {
    if (!csvText) { alert('CSV 파일을 먼저 선택하세요.'); return; }
    try {
      await importCsv(target.value, csvText);
      csvText = ''; file.value = '';
      await state.reload();
      alert('반영되었습니다.');
      // 현재 화면에 맞춰 부분 리렌더
      if (location.hash === '#/calendar') renderCalendar(state, state.reload);
      if (location.hash === '#/manmonth') mountManMonth(state);
      if (location.hash === '#/hr') { await mountHR(state); }
    } catch { alert('CSV 반영 실패'); }
  };
}

async function onRouteChange(hash) {
  activateRoute(hash);
  if (hash === '#/calendar') renderCalendar(state, state.reload);
  else if (hash === '#/manmonth') mountManMonth(state);
  else if (hash === '#/hr') await mountHR(state);
}

async function main() {
  // 인증 후 초기 로드
  initAuth(async (user) => {
    if (!user) {
      // 로그인 전: 화면만 유지, 데이터 렌더 안 함
      return;
    }
    state.reload = async () => { await loadAll(); }; // 주입
    await state.reload();
    bindCommonUI();
    mountRouter(onRouteChange);
    // 초기 진입 라우트 렌더
    await onRouteChange(location.hash || '#/calendar');
  });
}

main();