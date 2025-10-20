/**
 * Man-Month 계산: 기간 지정 → 팀 전체/개별 합계(mm) 산출
 */
import { db } from './firebase-init.js';
import {
  collection, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { fmt, generateWeekdays } from './holidays.js';

async function listMembers(teamId) {
  const col = collection(db, 'teams', teamId, 'members');
  const snaps = await getDocs(col);
  const members = [];
  snaps.forEach(d => members.push({ id: d.id, ...d.data() }));
  return members;
}

async function fetchWork(teamId, dateStr, uid) {
  const snap = await getDoc(doc(db, 'teams', teamId, 'work', dateStr, uid));
  return snap.exists() ? snap.data() : null;
}

export function renderManMonthView(profile) {
  const root = document.createElement('div');
  root.className = 'bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm';

  root.innerHTML = `
    <p class="text-xl font-bold mb-4">Man-Month 계산</p>
    <div class="flex flex-wrap items-end gap-3 mb-4">
      <div>
        <label class="text-sm text-gray-700">시작일</label>
        <input id="mm-start" type="date" class="border rounded px-2 py-1">
      </div>
      <div>
        <label class="text-sm text-gray-700">평일 수(가로 칸 수)</label>
        <input id="mm-days" type="number" min="1" value="20" class="border rounded px-2 py-1 w-24">
      </div>
      <button id="mm-calc" class="bg-[#1173d4] text-white rounded px-3 py-2">계산</button>
    </div>
    <div id="mm-result" class="overflow-x-auto"></div>
  `;

  root.querySelector('#mm-calc').addEventListener('click', async () => {
    const start = /** @type {HTMLInputElement} */(root.querySelector('#mm-start')).value;
    const days = Number(/** @type {HTMLInputElement} */(root.querySelector('#mm-days')).value || '20');
    if (!start) { alert('시작일을 선택하세요'); return; }

    const startDate = new Date(start + 'T00:00:00');
    const weekdays = generateWeekdays(startDate, days);
    const members = await listMembers(profile.teamId);

    const sumByMember = {};
    for (const m of members) {
      let acc = 0;
      for (const d of weekdays) {
        const ds = fmt(d);
        const w = await fetchWork(profile.teamId, ds, m.id);
        if (w?.tasks?.length) {
          acc += w.tasks.reduce((s, t) => s + (Number(t.mm) || 0), 0);
        }
      }
      sumByMember[m.id] = { name: m.displayName || m.id, mm: acc };
    }
    const total = Object.values(sumByMember).reduce((s, v) => s + v.mm, 0);

    // 테이블 렌더
    const table = document.createElement('table');
    table.className = 'min-w-[480px] w-full text-sm';
    table.innerHTML = `
      <thead>
        <tr class="text-left border-b">
          <th class="py-2">구성원</th>
          <th class="py-2">합계 (MM)</th>
        </tr>
      </thead>
      <tbody>
        ${Object.values(sumByMember).map(v => `
          <tr class="border-b">
            <td class="py-2">${v.name}</td>
            <td class="py-2 font-semibold">${v.mm.toFixed(2)}</td>
          </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td class="py-2 font-bold">총합</td>
          <td class="py-2 font-bold">${total.toFixed(2)}</td>
        </tr>
      </tfoot>
    `;
    const host = root.querySelector('#mm-result');
    host.innerHTML = '';
    host.appendChild(table);
  });

  return root;
