// js/hr.js
// 요구 반영:
// - 전체 조회/추가 가능 (DEV 규칙 기준)
// - 정렬 기준 선택 (팀/이름/직급/상태/평가)
// - 필터 (팀, 상태, 평가)
// - CSV 업로드/템플릿

import { db } from "./firebase.js";
import {
  collection, getDocs, addDoc, doc, setDoc, updateDoc, deleteDoc, query, where
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

export async function renderHRPage(container){
  container.innerHTML = `
    <div class="bg-white dark:bg-gray-900 p-4 md:p-6 rounded-xl shadow-sm">
      <div class="toolbar mb-4">
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">이름</label>
          <input id="emp-name" class="w-44 rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
        </div>
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">팀</label>
          <input id="emp-team" class="w-36 rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
        </div>
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">직급</label>
          <input id="emp-rank" class="w-32 rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
        </div>
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">상태</label>
          <select id="emp-status" class="w-32 rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm">
            <option value="active">재직</option>
            <option value="onleave">휴직</option>
            <option value="left">퇴사</option>
          </select>
        </div>
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">입사일</label>
          <input id="emp-join" type="date" class="w-40 rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
        </div>
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">퇴사일</label>
          <input id="emp-leave" type="date" class="w-40 rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
        </div>
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">평가</label>
          <select id="emp-eval" class="w-28 rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm">
            <option value="">-</option>
            <option>A</option><option>B</option><option>C</option><option>D</option><option>E</option>
          </select>
        </div>
        <button id="emp-add" class="rounded-lg bg-primary text-white px-4 py-2 h-10">추가/업데이트</button>
      </div>

      <div class="toolbar mb-3">
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">정렬</label>
          <select id="sort-key" class="w-36 rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm">
            <option value="team">팀</option>
            <option value="name">이름</option>
            <option value="rank">직급</option>
            <option value="status">상태</option>
            <option value="evalGrade">평가</option>
          </select>
        </div>
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">팀 필터</label>
          <input id="filter-team" class="w-36 rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
        </div>
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">상태 필터</label>
          <select id="filter-status" class="w-32 rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm">
            <option value="">전체</option>
            <option value="active">재직</option>
            <option value="onleave">휴직</option>
            <option value="left">퇴사</option>
          </select>
        </div>
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">평가 필터</label>
          <select id="filter-eval" class="w-28 rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm">
            <option value="">전체</option>
            <option>A</option><option>B</option><option>C</option><option>D</option><option>E</option>
          </select>
        </div>
        <button id="apply-filter" class="rounded-lg border px-3 py-2 h-10 dark:border-gray-700">적용</button>

        <div class="ml-auto flex items-center gap-2">
          <input id="csv-file" type="file" accept=".csv" class="text-sm"/>
          <button id="csv-upload" class="rounded-lg border px-3 py-2 dark:border-gray-700">CSV 업로드</button>
          <button id="template-btn" class="rounded-lg border px-3 py-2 dark:border-gray-700">템플릿</button>
        </div>
      </div>

      <div id="emp-list" class="table-scroll border rounded-lg"></div>
    </div>
  `;

  const nameEl = document.getElementById("emp-name");
  const teamEl = document.getElementById("emp-team");
  const rankEl = document.getElementById("emp-rank");
  const statusEl = document.getElementById("emp-status");
  const joinEl = document.getElementById("emp-join");
  const leaveEl = document.getElementById("emp-leave");
  const evalEl = document.getElementById("emp-eval");

  const sortKeyEl = document.getElementById("sort-key");
  const filterTeamEl = document.getElementById("filter-team");
  const filterStatusEl = document.getElementById("filter-status");
  const filterEvalEl = document.getElementById("filter-eval");

  document.getElementById("emp-add").onclick = async ()=>{
    const payload = {
      name: nameEl.value.trim(),
      team: teamEl.value.trim(),
      rank: rankEl.value.trim(),
      status: statusEl.value,
      joinDate: joinEl.value || "",
      leaveDate: leaveEl.value || "",
      evalGrade: evalEl.value || ""
    };
    if (!payload.name) { alert("이름은 필수입니다."); return; }
    if (!payload.team) { alert("팀은 필수입니다."); return; }

    // 동일 팀+이름 업데이트 / 없으면 추가
    const baseCol = collection(db, "employees");
    const q1 = query(baseCol, where("team","==", payload.team));
    const snaps = await getDocs(q1);
    let foundId = null;
    snaps.forEach(d=>{ const e=d.data(); if (e.name===payload.name) foundId=d.id; });

    if (foundId) {
      await updateDoc(doc(db, "employees", foundId), payload);
      alert("업데이트 완료");
    } else {
      await addDoc(collection(db, "employees"), payload);
      alert("추가 완료");
    }
    await renderList();
  };

  document.getElementById("template-btn").onclick = ()=>{
    const csv = "id,name,team,rank,status,joinDate,leaveDate,evalGrade\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "employees_template.csv";
    a.click();
  };

  function parseCSV(text){
    const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(Boolean);
    const headers = lines[0].split(",").map(s=>s.trim());
    return lines.slice(1).map(line=>{
      const cols = line.split(",").map(s=>s.trim());
      const obj = {};
      headers.forEach((h, i)=> obj[h] = (cols[i]||""));
      return obj;
    });
  }

  document.getElementById("csv-upload").onclick = async ()=>{
    const f = document.getElementById("csv-file").files[0];
    if (!f) { alert("CSV 파일을 선택하세요."); return; }
    const text = await f.text();
    const rows = parseCSV(text);
    for (const r of rows) {
      const payload = {
        name: r.name || "",
        team: r.team || "",
        rank: r.rank || "",
        status: r.status || "active",
        joinDate: r.joinDate || "",
        leaveDate: r.leaveDate || "",
        evalGrade: r.evalGrade || ""
      };
      if (!payload.team) continue;

      if (r.id) {
        await setDoc(doc(db, "employees", r.id), payload, { merge:true });
      } else {
        await addDoc(collection(db, "employees"), payload);
      }
    }
    alert(`업로드 완료: ${rows.length}건`);
    await renderList();
  };

  document.getElementById("apply-filter").onclick = renderList;
  sortKeyEl.onchange = renderList;

  async function renderList(){
    const listEl = document.getElementById("emp-list");
    const snaps = await getDocs(collection(db, "employees"));
    let rows = [];
    snaps.forEach(d=> rows.push({ id:d.id, ...d.data() }));

    // 필터
    const ft = filterTeamEl.value.trim();
    const fs = filterStatusEl.value;
    const fe = filterEvalEl.value;
    if (ft) rows = rows.filter(r=> (r.team||"").includes(ft));
    if (fs) rows = rows.filter(r=> (r.status||"") === fs);
    if (fe) rows = rows.filter(r=> (r.evalGrade||"") === fe);

    // 정렬
    const key = sortKeyEl.value || "team";
    rows.sort((a,b)=> (a[key]||"").localeCompare(b[key]||"") || (a.name||"").localeCompare(b.name||""));

    listEl.innerHTML = `
      <table class="min-w-full text-sm">
        <thead class="text-left bg-gray-50 dark:bg-gray-800">
          <tr>
            <th class="py-2 px-3">ID</th>
            <th class="py-2 px-3">이름</th>
            <th class="py-2 px-3">팀</th>
            <th class="py-2 px-3">직급</th>
            <th class="py-2 px-3">상태</th>
            <th class="py-2 px-3">입사일</th>
            <th class="py-2 px-3">퇴사일</th>
            <th class="py-2 px-3">평가</th>
            <th class="py-2 px-3">작업</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r=>`
            <tr class="border-b border-gray-100 dark:border-gray-800">
              <td class="py-2 px-3">${r.id}</td>
              <td class="py-2 px-3">${r.name||""}</td>
              <td class="py-2 px-3">${r.team||""}</td>
              <td class="py-2 px-3">${r.rank||""}</td>
              <td class="py-2 px-3">${r.status||""}</td>
              <td class="py-2 px-3">${r.joinDate||""}</td>
              <td class="py-2 px-3">${r.leaveDate||""}</td>
              <td class="py-2 px-3">${r.evalGrade||""}</td>
              <td class="py-2 px-3">
                <button data-id="${r.id}" class="emp-del text-rose-600 hover:underline">삭제</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    listEl.querySelectorAll(".emp-del").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        if (!confirm("삭제하시겠습니까?")) return;
        await deleteDoc(doc(db, "employees", btn.dataset.id));
        await renderList();
      });
    });
  }

  await renderList();
}
