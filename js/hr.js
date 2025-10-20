/**
 * 인력 관리: 신규 입사/퇴사, 직급/평가(A~E) 관리
 * Firestore:
 *  - /teams/{teamId}/members/{uid}: displayName,email,position
 *  - /teams/{teamId}/hrProfiles/{uid}: rank(A~E), joined, left
 */
import { db } from './firebase-init.js';
import {
  collection, getDocs, setDoc, doc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { makeCSVInput, parseCSV } from './calendar.js';

async function loadMembers(teamId) {
  const snaps = await getDocs(collection(db, 'teams', teamId, 'members'));
  const arr = [];
  snaps.forEach(d => arr.push({ id: d.id, ...d.data() }));
  arr.sort((a,b) => (a.displayName||'').localeCompare(b.displayName||'', 'ko'));
  return arr;
}
async function loadProfiles(teamId) {
  const snaps = await getDocs(collection(db, 'teams', teamId, 'hrProfiles'));
  const map = {};
  snaps.forEach(d => map[d.id] = d.data());
  return map;
}

export function renderHRView(profile) {
  const root = document.createElement('div');
  root.className = 'bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm';
  root.innerHTML = `
    <p class="text-xl font-bold mb-4">인력 관리</p>
    <div class="flex flex-wrap items-end gap-3 mb-4">
      <button id="add-member" class="bg-[#1173d4] text-white rounded px-3 py-2">신규 입사</button>
      <button id="delete-member" class="bg-red-500 text-white rounded px-3 py-2">퇴사(삭제)</button>
      <div class="text-sm text-gray-500">* 간단 CRUD. 상세 필드는 CSV로 일괄 반영 가능</div>
    </div>
    <div id="csv-host" class="mb-4"></div>
    <div id="hr-list" class="overflow-x-auto"></div>
  `;

  const csvHost = root.querySelector('#csv-host');
  csvHost.appendChild(
    makeCSVInput('CSV 업로드( members / profiles )', async (text) => {
      const rows = parseCSV(text);
      for (const r of rows) {
        const tp = (r.type||'').toLowerCase();
        if (tp === 'members') {
          const uid = r.uid || crypto.randomUUID();
          await setDoc(doc(db, 'teams', profile.teamId, 'members', uid), {
            displayName: r.displayName, email: r.email, position: r.position
          }, { merge: true });
        } else if (tp === 'profiles') {
          await setDoc(doc(db, 'teams', profile.teamId, 'hrProfiles', r.uid), {
            rank: r.rank, joined: r.joined || null, left: r.left || null
          }, { merge: true });
        }
      }
      alert('CSV 반영 완료');
      renderList();
    })
  );

  root.querySelector('#add-member').addEventListener('click', async () => {
    const name = prompt('이름?');
    if (!name) return;
    const email = prompt('이메일?(선택)') || '';
    const position = prompt('직급/직책?(선택)') || '';
    const uid = crypto.randomUUID();
    await setDoc(doc(db, 'teams', profile.teamId, 'members', uid), {
      displayName: name, email, position
    });
    await setDoc(doc(db, 'teams', profile.teamId, 'hrProfiles', uid), {
      rank: 'C', joined: new Date().toISOString().slice(0,10)
    }, { merge: true });
    renderList();
  });

  root.querySelector('#delete-member').addEventListener('click', async () => {
    const uid = prompt('퇴사 처리할 UID? (members 문서 ID)');
    if (!uid) return;
    await deleteDoc(doc(db, 'teams', profile.teamId, 'members', uid));
    await deleteDoc(doc(db, 'teams', profile.teamId, 'hrProfiles', uid));
    alert('삭제 완료');
    renderList();
  });

  async function renderList() {
    const listHost = root.querySelector('#hr-list');
    const members = await loadMembers(profile.teamId);
    const profiles = await loadProfiles(profile.teamId);

    const table = document.createElement('table');
    table.className = 'min-w-[720px] w-full text-sm';
    table.innerHTML = `
      <thead>
        <tr class="text-left border-b">
          <th class="py-2">UID</th>
          <th class="py-2">이름</th>
          <th class="py-2">이메일</th>
          <th class="py-2">직급/직책</th>
          <th class="py-2">평가(A~E)</th>
          <th class="py-2">입사일</th>
          <th class="py-2">퇴사일</th>
          <th class="py-2">저장</th>
        </tr>
      </thead>
      <tbody>
        ${members.map(m => {
          const p = profiles[m.id] || {};
          return `
          <tr class="border-b" data-uid="${m.id}">
            <td class="py-2 text-gray-500">${m.id}</td>
            <td class="py-2">${m.displayName ?? ''}</td>
            <td class="py-2">${m.email ?? ''}</td>
            <td class="py-2"><input class="border rounded px-2 py-1" data-field="position" value="${m.position ?? ''}"></td>
            <td class="py-2">
              <select class="border rounded px-2 py-1" data-field="rank">
                ${['A','B','C','D','E'].map(r => `<option value="${r}" ${p.rank===r?'selected':''}>${r}</option>`).join('')}
              </select>
            </td>
            <td class="py-2"><input type="date" class="border rounded px-2 py-1" data-field="joined" value="${p.joined ?? ''}"></td>
            <td class="py-2"><input type="date" class="border rounded px-2 py-1" data-field="left" value="${p.left ?? ''}"></td>
            <td class="py-2"><button class="bg-[#1173d4] text-white rounded px-2 py-1 save-row">저장</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    `;
    listHost.innerHTML = '';
    listHost.appendChild(table);

    table.querySelectorAll('.save-row').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        const uid = tr.getAttribute('data-uid');
        const pos = /** @type {HTMLInputElement} */(tr.querySelector('[data-field="position"]')).value;
        const rank = /** @type {HTMLSelectElement} */(tr.querySelector('[data-field="rank"]')).value;
        const joined = /** @type {HTMLInputElement} */(tr.querySelector('[data-field="joined"]')).value;
        const left = /** @type {HTMLInputElement} */(tr.querySelector('[data-field="left"]')).value;

        await setDoc(doc(db, 'teams', profile.teamId, 'members', uid), { position: pos }, { merge: true });
        await setDoc(doc(db, 'teams', profile.teamId, 'hrProfiles', uid), { rank, joined: joined || null, left: left || null }, { merge: true });

        tr.style.outline = '2px solid #93c5fd';
        setTimeout(() => (tr.style.outline = ''), 700);
      });
    });
  }

  renderList();
  return root;
