// js/hr.js
// 인력 관리: CRUD + CSV 업로드
// 비관리자는 자신의 팀만 조회 가능(팀 필터 쿼리). 관리자는 전체.

import { db } from "./firebase.js";
import { requireAuthAndTeams } from "./auth.js";
import {
  collection, getDocs, addDoc, doc, setDoc, updateDoc, deleteDoc, query, where
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

  const { currentTeams, isAdmin } = await requireAuthAndTeams();

  const nameEl = document.getElementById("emp-name");
  const teamEl = document.getElementById("emp-team");
  const rankEl = document.getElementById("emp-rank");
  const statusEl = document.getElementById("emp-status");
  const joinEl = document.getElementById("emp-join");
  const leaveEl = document.getElementById("emp-leave");
  const evalEl = document.getElementById("emp-eval");

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

    // 동일 팀 내 동일 이름 존재 시 업데이트 (팀 필터 쿼리)
    let foundId = null;
    const baseCol = collection(db, "employees");
    let snaps;
    if (isAdmin) {
      // 관리자: 팀 기준으로만 좁혀서 읽고 이름 비교 (전체 스캔 지양)
      const q1 = query(baseCol, where("team","==", payload.team));
      snaps = await getDocs(q1);
    } else {
      // 비관리자: 자신의 팀만
      if (!currentTeams.includes(payload.team)) {
        alert("해당 팀에 대한 쓰기 권한이 없습니다.");
        return;
      }
      const q1 = query(baseCol, where("team","==", payload.team));
      snaps = await getDocs(q1);
    }
    snaps.forEach(d=>{
      const e = d.data();
      if (e.name===payload.name) foundId = d.id;
    });

    if (foundId) {
      await updateDoc(doc(db, "employees", foundId), payload); // 규칙상 관리자만 write 가능
      alert("업데이트 완료(관리자 전용 기능)");
    } else {
      await addDoc(collection(db, "employees"), payload);       // 규칙상 관리자만 write 가능
      alert("추가 완료(관리자 전용 기능)");
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
    // 관리자가 아닌 경우 업로드 차단(규칙도 write 차단)
    if (!isAdmin) {
      alert("CSV 업로드는 관리자만 가능합니다.");
      return;
    }
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

  async function renderList(){
    const listEl = document.getElementById("emp-list");
    const baseCol = collection(db, "employees");
    let rows = [];

    if (isAdmin) {
      const snaps = await getDocs(baseCol);
      snaps.forEach(d=> rows.push({ id:d.id, ...d.data() }));
    } else {
      // 팀 in 쿼리 (10개 제한 대응)
      const teams = currentTeams || [];
      if (!teams.length) {
        listEl.innerHTML = `<div class="p-4 text-sm text-rose-600">팀 권한이 없습니다. 관리자에게 문의하세요.</div>`;
        return;
      }
      if (teams.length <= 10) {
        const q1 = query(baseCol, where("team","in", teams));
        const snaps = await getDocs(q1);
        snaps.forEach(d=> rows.push({ id:d.id, ...d.data() }));
      } else {
        for (let i=0;i<teams.length;i+=10) {
          const q1 = query(baseCol, where("team","in", teams.slice(i,i+10)));
          const snaps = await getDocs(q1);
          snaps.forEach(d=> rows.push({ id:d.id, ...d.data() }));
        }
      }
    }

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
                <button data-id="${r.id}" class="emp-del text-rose-600 hover:underline"${isAdmin ? "" : " disabled"}>${isAdmin ? "삭제" : "삭제(관리자 전용)"}</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    listEl.querySelectorAll(".emp-del").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        if (!isAdmin) { alert("삭제는 관리자만 가능합니다."); return; }
        if (!confirm("삭제하시겠습니까?")) return;
        await deleteDoc(doc(db, "employees", btn.dataset.id));
        await renderList();
      });
    });
  }

  await renderList();
}
