// calendar.js
// 주중만 가로 달력 렌더 / 빠른 배치 입력

import { createAssignment } from "./api.js";

function toISO(d) { const t=new Date(d); t.setHours(9,0,0,0); return t.toISOString().slice(0,10); }
function addDays(iso, n) { const d=new Date(iso); d.setDate(d.getDate()+n); return toISO(d); }
function fmtLabel(iso) {
  const d=new Date(iso); const mm=d.getMonth()+1, dd=d.getDate();
  const yoil = ['일','월','화','수','목','금','토'][d.getDay()];
  return `${mm}/${dd} (${yoil})`;
}
function isWeekend(iso){ const dow=new Date(iso).getDay(); return dow===0||dow===6; }

function buildWeekdays(baseISO){
  const base=new Date(baseISO); const day=base.getDay();
  const monday = addDays(toISO(base), (day===0 ? -6 : 1-day));
  const arr=[]; for (let i=0;i<5;i++) arr.push(addDays(monday,i));
  return { monday, days: arr };
}

export function renderCalendar(state, reloadAll) {
  const { days, monday } = buildWeekdays(state.ui.baseDate);
  state.ui.weekdays = days;

  const start = days[0], end = days[days.length-1];
  document.getElementById('range-label').textContent = `${fmtLabel(start)} ~ ${fmtLabel(end)}`;

  // 날짜 헤더
  const head = document.getElementById('date-header');
  head.innerHTML = '';
  days.forEach(iso => {
    const hol = state.holidays.find(h => h.date === iso);
    head.insertAdjacentHTML('beforeend', `
      <div class="cell !border-b-0 !border-r-0">
        <div class="flex items-center justify-between">
          <span class="${hol ? 'text-holiday font-bold' : 'text-gray-700 dark:text-gray-200'}">${fmtLabel(iso)}</span>
          ${hol ? `<span class="badge-holiday">${hol.name}</span>` : ''}
        </div>
      </div>
    `);
  });

  // 좌측 멤버
  const memberList = document.getElementById('member-list');
  memberList.innerHTML = '';
  state.employees.forEach(emp => {
    const row = document.createElement('div');
    row.className = "flex items-center justify-between gap-2 border rounded-md px-2 py-2";
    row.innerHTML = `
      <div>
        <div class="font-semibold">${emp.name}</div>
        <div class="text-xs text-gray-500">${emp.team || ''} ${emp.rank ? '· '+emp.rank : ''}</div>
      </div>
      <button class="btn-mini" data-emp="${emp.id}">역할/업무</button>
    `;
    row.querySelector('button').onclick = () => openAssignQuick(state, emp);
    memberList.appendChild(row);
  });

  // 바디
  const body = document.getElementById('calendar-body');
  body.innerHTML = '';
  state.employees.forEach(emp => {
    const row = document.createElement('div');
    row.className = "grid";
    row.style.gridTemplateColumns = `repeat(${days.length}, 160px)`;

    days.forEach(iso => {
      const aToday = state.assignments.filter(a => a.employeeId===emp.id && iso>=a.startDate && iso<=a.endDate);
      const hol = state.holidays.find(h => h.date === iso);
      const cell = document.createElement('div');
      cell.className = `cell ${hol ? 'bg-red-50 dark:bg-red-950/20':''}`;
      cell.innerHTML = `
        ${aToday.map(a => `
          <div class="mb-1">
            <div class="text-[11px] font-semibold">${a.role || ''}</div>
            <div class="text-[11px] truncate">${a.task || ''}</div>
          </div>
        `).join('')}
        <button class="btn-mini">추가</button>
      `;
      cell.querySelector('button').onclick = () => openAssignQuick(state, emp, iso);
      row.appendChild(cell);
    });

    body.appendChild(row);
  });

  // 이동
  document.getElementById('prev-week').onclick = () => { state.ui.baseDate = addDays(monday, -7); renderCalendar(state, reloadAll); };
  document.getElementById('next-week').onclick = () => { state.ui.baseDate = addDays(monday, 7); renderCalendar(state, reloadAll); };
  document.getElementById('today').onclick = () => { state.ui.baseDate = toISO(new Date()); renderCalendar(state, reloadAll); };
  document.getElementById('btn-jump').onclick = () => {
    const v = document.getElementById('jump-date').value;
    if (v) { state.ui.baseDate = v; renderCalendar(state, reloadAll); }
  };

  // 좌측 "팀원 추가"는 HR 화면으로 안내
  const btnAdd = document.getElementById('btn-add-member');
  if (btnAdd) btnAdd.onclick = () => { location.hash = '#/hr'; };
}

async function openAssignQuick(state, emp, iso) {
  const role = prompt(`역할 입력\n(예: ${state.presets.roles[0] || '인프라'})`, state.presets.roles[0] || '');
  if (role === null) return;
  const task = prompt(`업무 내용 입력\n(예: ${state.presets.tasks[0] || '신규 개발'})`, state.presets.tasks[0] || '');
  if (task === null) return;
  const startDate = iso || prompt('시작일(YYYY-MM-DD)', state.ui.weekdays[0]);
  if (startDate === null) return;
  const endDate = prompt('종료일(YYYY-MM-DD)', startDate);
  if (endDate === null) return;

  await createAssignment({ employeeId: emp.id, role, task, startDate, endDate });
  // 상위에서 새로고침 핸들러 호출
  if (typeof state.reload === 'function') await state.reload();
}