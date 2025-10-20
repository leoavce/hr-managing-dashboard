// js/hr.js
// 인력 관리: CRUD + CSV 업로드

import { db } from "./firebase.js";
import {
  collection, getDocs, addDoc, doc, setDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

export async function renderHRPage(container){
  container.innerHTML = `
    <div class="bg-white dark:bg-gray-900 p-4 md:p-6 rounded-xl shadow-sm">
      <div class="flex flex-wrap items-end gap-3 mb-4">
        <div class="w-48">
          <label class="block text-sm text-gray-600 dark:text-gray-300">이름</label>
          <input id="emp-name" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
        </div>
        <div class="w-40">
          <label class="block text-sm text-gray-600 dark:text-gray-300">팀</label>
          <input id="emp-team" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
        </div>
        <div class="w-32">
          <label class="block text-sm text-gray-600 dark:text-gray-300">직급</label>
          <input id="emp-rank" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
        </div>
        <div class="w-36">
          <label class="block text-sm text-gray-600 dark:text-gray-300">상태</label>
          <select id="emp-status" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm">
            <option value="active">재직</option>
            <option value="onleave">휴직</option>
            <option value="left">퇴사</option>
          </select>
        </div>
        <div class="w-40">
          <label class="block text-sm text-gray-600 dark:text-gray-300">입사일</label>
          <input id="emp-join" type="date" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
        </div>
        <div class="w-40">
          <label class="block text-sm text-gray-600 dark:text-gray-300">퇴사일</label>
          <input id="emp-leave" type="date" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
        </div>
        <div class="w-28">
          <label class="block text-sm text-gray-600 dark:text-gray-300">평가</label>
          <select id="emp-eval" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm">
            <option value="">-</option>
            <option>A</option><option>B</option><option>C</option><option>D</option><option>E</option>
          </select>
        </div>
        <button id="emp-add" class="rounded-lg bg-primary text-white px-4 py-2">추가/업데이트</button>
      </div>

      <div class="flex items-center justify-between gap-2 mb-3">
        <div class="text-sm text-gray-600 dark:text-gray-300">
          CSV 업로드(Excel에서 내보내기): id,name,team,rank,status,joinDate,leaveDate,evalGrade
        </div>
        <div class="flex items-center gap-2">
          <input id="csv-file" type="file" accept=".csv" class="text-sm"/>
          <button id="csv-upload" class="rounded-lg border px-3 py-1.5">업로드</button>
          <button id="template-btn" class="rounded-lg border px-3 py-1.5">템플릿 다운로드</button>
        </div>
      </div>

      <div id="emp-list" class="overflow-auto border rounded-lg"></div>
    </div>
  `;

  const nameEl = document.getElementById("emp-name");
  const teamEl = document.getElementById("emp-team");
  const rankEl = document.getElementById("emp-rank");
  const statusEl = document.getElementById("emp-status");
  const joinEl = document.getElementById("emp-join");
  const leaveEl = document.getElementById("emp-leave");
  const evalEl = document.getElementById("emp-eval");

  document.getElementById("emp-add").onclick = async ()=>{
    // id는 이름+팀 기반 생성 or 수동 ID? -> 여기서는 Firestore autoId 사용
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

    // 동일 이름/팀 있으면 업데이트, 없으면 신규
    const snap = await getDocs(collection(db, "employees"));
    let foundId = null;
    snap.forEach(d=>{
      const e = d.data();
      if (e.name===payload.name && e.team===payload.team) foundId = d.id;
    });
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

  // 간단 CSV 파서 (따옴표/콤마 기본 처리, 엣지케이스 단순화)
  function parseCSV(text){
    const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(Boolean);
    const headers = lines[0].split(",").map(s=>s.trim());
    return lines.slice(1).map(line=>{
      // 기본 콤마 split. 큰따옴표 포함 케이스는 더 정교한 파서 필요(사내 포맷은 단순 가정)
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
    // 업서트
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
      if (r.id) {
        await setDoc(doc(db, "employees", r.id), payload, { merge:true });
      } else {
        await addDoc(collection(db, "employees"), payload);
      }
    }
    alert(`업로드 완료: ${rows.length}건`);
    await renderList();
  };

  async function renderList(){
    const listEl = document.getElementById("emp-list");
    const snap = await getDocs(collection(db, "employees"));
    const rows = [];
    snap.forEach(d=> rows.push({ id:d.id, ...d.data() }));
    rows.sort((a,b)=> (a.team||"").localeCompare(b.team||"") || (a.name||"").localeCompare(b.name||""));

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
