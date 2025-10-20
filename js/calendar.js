/**
 * 가로 스크롤 평일 달력 + 팀원/역할/업무 표시 + 템플릿 저장/불러오기
 */
import { db } from './firebase-init.js';
import { generateWeekdays, loadHolidayMap, fmt, toKoreanDayShort } from './holidays.js';
import {
  collection, query, where, getDocs, setDoc, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { makeCSVInput, makeTemplatesSelector } from './ui.js';

/** 팀원 로드: /teams/{teamId}/members/{uid} => {displayName, role(직급), position} */
export async function loadTeamMembers(teamId) {
  const col = collection(db, 'teams', teamId, 'members');
  const snaps = await getDocs(col);
  const members = [];
  snaps.forEach((d) => members.push({ id: d.id, ...d.data() }));
  // 이름 기준 정렬
  members.sort((a,b) => (a.displayName||'').localeCompare(b.displayName||'', 'ko'));
  return members;
}

/** 해당 날짜의 업무: /teams/{teamId}/work/{yyyy-mm-dd}/{uid} => { role, tasks:[{title,hours,mm}] } */
export async function loadWorkForDates(teamId, dates) {
  const byDate = {};
  await Promise.all(dates.map(async (d) => {
    const dayStr = fmt(d);
    byDate[dayStr] = {};
    // 각 멤버별 문서 uid로 직접 접근하는 쿼리는 collectionGroup 없이 경로가 정해져야 함.
    // 여기서는 렌더 시 멤버 id를 알고 있을 때 개별 조회하도록 설계. (렌더 루프에서 사용)
  }));
  return byDate;
}

async function saveWork(teamId, dateStr, uid, payload) {
  await setDoc(doc(db, 'teams', teamId, 'work', dateStr, uid), payload, { merge: true });
}

/** 자주 쓰는 템플릿: /teams/{teamId}/templates/{templateId} => { name, role, tasks:[{title,hours,mm}] } */
async function loadTemplates(teamId) {
  const col = collection(db, 'teams', teamId, 'templates');
  const snaps = await getDocs(col);
  const arr = [];
  snaps.forEach((d) => arr.push({ id: d.id, ...d.data() }));
  return arr;
}

function buildHeaderRow(dates, holidayMap) {
  const header = document.createElement('div');
  header.className = 'calendar-header bg-white dark:bg-gray-900 sticky top-0 z-10';
  // 좌측 멤버 고정 컬럼
  const left = document.createElement('div');
  left.className = 'member-col font-bold flex items-center justify-between px-3 py-2';
  left.innerHTML = `<span>팀원</span><span class="text-xs text-gray-500">역할</span>`;
  header.appendChild(left);

  dates.forEach((d) => {
    const ds = fmt(d);
    const isHoliday = !!holidayMap[ds];
    const cell = document.createElement('div');
    cell.className = 'calendar-cell ' + (isHoliday ? 'holiday' : '');
    cell.innerHTML = `
      <div class="date-text text-xs text-gray-700">${ds} (${toKoreanDayShort(d)})</div>
      ${isHoliday ? `<div class="text-[11px] text-red-600 font-semibold mt-1">${holidayMap[ds]}</div>` : ''}
    `;
    header.appendChild(cell);
  });
  return header;
}

function buildMemberRow(teamId, member, dates, holidayMap, templates) {
  const row = document.createElement('div');
  row.className = 'calendar-row bg-white dark:bg-gray-900 border-t';

  // 좌측 멤버 정보
  const left = document.createElement('div');
  left.className = 'member-col px-3 py-2';
  left.innerHTML = `
    <div class="font-semibold text-gray-800">${member.displayName ?? '(이름없음)'}</div>
    <div class="text-xs text-gray-500">${member.position ?? ''}</div>
  `;
  row.appendChild(left);

  dates.forEach(async (d) => {
    const ds = fmt(d);
    const isHoliday = !!holidayMap[ds];
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    if (isHoliday) cell.classList.add('opacity-60');

    // 해당 멤버/일자의 기존 데이터 로드
    const snap = await getDoc(doc(db, 'teams', teamId, 'work', ds, member.id));
    const data = snap.exists() ? snap.data() : { role: '', tasks: [] };

    // 역할/업무 UI
    const roleInputId = `role-${member.id}-${ds}`;
    const taskInputId = `task-${member.id}-${ds}`;
    const saveBtnId  = `save-${member.id}-${ds}`;

    const tplSelector = templates.length
      ? `
        <div class="mt-2">${/* 템플릿 셀렉터는 JS helper로 대체 */''}</div>
      ` : '';

    cell.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="badge badge-role">${data.role || '역할 미지정'}</span>
      </div>
      <div class="mt-1 space-y-1">
        ${(data.tasks||[]).slice(0,3).map(t => `<span class="badge badge-task">${t.title} · ${t.hours ?? 0}h</span>`).join(' ')}
      </div>
      <div class="mt-2">
        <input id="${roleInputId}" placeholder="역할(인프라/보안 등)" class="border rounded px-2 py-1 text-xs w-full" value="${data.role || ''}">
      </div>
      <div class="mt-1">
        <input id="${taskInputId}" placeholder="업무(쉼표로 여러개), 예: 점검 2h,보고서 4h" class="border rounded px-2 py-1 text-xs w-full">
      </div>
      <div class="mt-2 flex items-center gap-2">
        <button id="${saveBtnId}" class="text-xs bg-[#1173d4] text-white rounded px-2 py-1">저장</button>
      </div>
    `;
    row.appendChild(cell);

    // 템플릿 선택(역할/업무 자동채움)
    if (templates.length) {
      const host = cell.querySelector('.mt-2'); // 첫 번째 mt-2 영역 아래에 붙임
      const sel = document.createElement('div');
      sel.className = 'mt-2';
      sel.appendChild(
        (await import('./ui.js')).makeTemplatesSelector(
          '템플릿', templates.map(t => ({ value: t.id, label: t.name || t.id })),
          (val) => {
            const picked = templates.find(t => t.id === val);
            if (!picked) return;
            const roleEl = /** @type {HTMLInputElement} */(cell.querySelector('#'+roleInputId));
            const taskEl = /** @type {HTMLInputElement} */(cell.querySelector('#'+taskInputId));
            if (picked.role) roleEl.value = picked.role;
            if (picked.tasks?.length) {
              taskEl.value = picked.tasks.map(tt => `${tt.title} ${tt.hours ?? 0}h`).join(', ');
            }
          }
        )
      );
      host.parentElement?.appendChild(sel);
    }

    // 저장 이벤트
    cell.querySelector('#'+saveBtnId).addEventListener('click', async () => {
      const roleVal = /** @type {HTMLInputElement} */(cell.querySelector('#'+roleInputId)).value.trim();
      const tasksVal = /** @type {HTMLInputElement} */(cell.querySelector('#'+taskInputId)).value.trim();

      const tasks = [];
      if (tasksVal) {
        // "업무명 2h" 형태 쉼표 분할
        tasksVal.split(',').map(s => s.trim()).filter(Boolean).forEach(part => {
          const m = part.match(/(.+?)\s+(\d+(?:\.\d+)?)h$/i);
          if (m) {
            tasks.push({ title: m[1].trim(), hours: Number(m[2]), mm: Number(m[2]) / (8) });
          } else {
            tasks.push({ title: part, hours: 0, mm: 0 });
          }
        });
      }

      await saveWork(teamId, ds, member.id, {
        role: roleVal,
        tasks,
        updatedAt: new Date().toISOString()
      });
      // 간단 피드백
      cell.style.outline = '2px solid #93c5fd';
      setTimeout(() => (cell.style.outline = ''), 700);
      // 배지 즉시 반영
      cell.querySelector('.badge-role').textContent = roleVal || '역할 미지정';
      const listHost = cell.querySelector('.mt-1.space-y-1');
      listHost.innerHTML = tasks.slice(0,3).map(t => `<span class="badge badge-task">${t.title} · ${t.hours ?? 0}h</span>`).join(' ');
    });
  });

  return row;
}

/** CSV 포맷 예시:
 *  type: members|work|holidays|templates|profiles
 *  members: displayName,email,position,uid(optional)
 *  work: date(yyyy-mm-dd),uid,role,tasks("점검 2h;보고서 4h")
 *  holidays: date(yyyy-mm-dd),name
 *  templates: name,role,tasks("점검 2h;보고서 4h")
 *  profiles: uid,rank(A~E),joined(yyyy-mm-dd),left(yyyy-mm-dd optional)
 */
export function parseCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(',').map(s => s.trim());
  return lines.slice(1).map(line => {
    const cols = [];
    let curr = '', inQuote = false;
    for (let i=0;i<line.length;i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { cols.push(curr.trim()); curr=''; }
      else curr += ch;
    }
    cols.push(curr.trim());
    const obj = {};
    header.forEach((h, idx) => obj[h] = cols[idx] ?? '');
    return obj;
  });
}

export function renderCalendarView(profile) {
  const container = document.createElement('div');
  container.className = 'bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm';

  const title = document.createElement('div');
  title.className = 'flex items-center justify-between mb-4';
  title.innerHTML = `
    <div>
      <p class="text-xl font-bold text-gray-800 dark:text-white">인력 투입 현황(가로 캘린더)</p>
      <p class="text-xs text-gray-500 mt-1">${profile?.teamId ? `Team: ${profile.teamId}` : ''}</p>
    </div>
    <div class="flex items-center gap-2">
      <button id="prev-20" class="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-gray-800 material-symbols-outlined">chevron_left</button>
      <button id="next-20" class="rounded-full p-2 hover:bg-gray-100 dark:hover:bg-gray-800 material-symbols-outlined">chevron_right</button>
    </div>
  `;
  container.appendChild(title);

  const tool = document.createElement('div');
  tool.className = 'flex flex-wrap items-center gap-3 mb-3';
  container.appendChild(tool);

  const host = document.createElement('div');
  host.className = 'horizontal-calendar';
  container.appendChild(host);

  // CSV 업로드 툴
  tool.appendChild(makeCSVInput('CSV 업로드(멤버/업무/휴일/템플릿/프로필)', async (text) => {
    const rows = parseCSV(text);
    // 간단한 upsert: type 필드로 분기
    for (const r of rows) {
      const tp = (r.type||'').toLowerCase();
      if (tp === 'members') {
        const uid = r.uid || crypto.randomUUID();
        await setDoc(doc(db, 'teams', profile.teamId, 'members', uid), {
          displayName: r.displayName, email: r.email, position: r.position
        }, { merge: true });
      } else if (tp === 'work') {
        const tasks = String(r.tasks||'').split(';').map(s=>s.trim()).filter(Boolean)
          .map(part => {
            const m = part.match(/(.+?)\s+(\d+(?:\.\d+)?)h$/i);
            if (m) return { title: m[1].trim(), hours: Number(m[2]), mm: Number(m[2])/8 };
            return { title: part, hours: 0, mm: 0 };
          });
        await setDoc(doc(db, 'teams', profile.teamId, 'work', r.date, r.uid), {
          role: r.role || '', tasks, updatedAt: new Date().toISOString()
        }, { merge: true });
      } else if (tp === 'holidays') {
        await setDoc(doc(db, 'teams', profile.teamId, 'holidays', r.date), { name: r.name || '휴일' }, { merge: true });
      } else if (tp === 'templates') {
        const tid = crypto.randomUUID();
        const tasks = String(r.tasks||'').split(';').map(s=>s.trim()).filter(Boolean)
          .map(part => {
            const m = part.match(/(.+?)\s+(\d+(?:\.\d+)?)h$/i);
            if (m) return { title: m[1].trim(), hours: Number(m[2]), mm: Number(m[2])/8 };
            return { title: part, hours: 0, mm: 0 };
          });
        await setDoc(doc(db, 'teams', profile.teamId, 'templates', tid), {
          name: r.name || '템플릿', role: r.role || '', tasks
        }, { merge: true });
      } else if (tp === 'profiles') {
        await setDoc(doc(db, 'teams', profile.teamId, 'hrProfiles', r.uid), {
          rank: r.rank, joined: r.joined || null, left: r.left || null
        }, { merge: true });
      }
    }
    alert('CSV 반영 완료');
    // 새로고침 없이도 재렌더 위해 트리거
    await render(Date.nowOffset || 0);
  }));

  // 날짜 윈도우
  Date.nowOffset = Date.nowOffset ?? 0; // 오프셋 저장(세션 중)
  async function render(offsetDays = 0) {
    Date.nowOffset = (Date.nowOffset || 0) + offsetDays;
    const base = new Date();
    base.setDate(base.getDate() + Date.nowOffset);

    const weekdays = generateWeekdays(base, 20); // 평일 20칸 가로
    const year = base.getFullYear();
    const holidayMap = await loadHolidayMap(profile.teamId, year);
    const members = await loadTeamMembers(profile.teamId);
    const templates = await loadTemplates(profile.teamId);

    host.innerHTML = '';
    host.appendChild(buildHeaderRow(weekdays, holidayMap));

    for (const m of members) {
      const row = buildMemberRow(profile.teamId, m, weekdays, holidayMap, templates);
      host.appendChild(row);
    }
  }

  container.querySelector('#prev-20').addEventListener('click', () => render(-20));
  container.querySelector('#next-20').addEventListener('click', () => render(+20));

  // 최초 렌더
  render(0);

  return container;
