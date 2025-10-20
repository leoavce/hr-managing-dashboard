// js/mm.js
// 요구 반영:
// - 팀원 로드 안되던 문제 해결 (전체 employees 로드)
// - 기간별 MM 계산 (평일 기준, 공휴일 제외) – assignments의 allocation 합산
// - 팀/이름 필터 + CSV 내보내기

import { db } from "./firebase.js";
import {
  collection, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

function fmt(d){ return d.toISOString().slice(0,10); }
function parseYmd(s){ const [y,m,dd]=s.split("-").map(Number); return new Date(y, m-1, dd); }
function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function isWeekend(d){ const day=d.getDay(); return day===0 || day===6; }

// 한국 공휴일(샘플)
const STATIC_HOLIDAYS = {
  2024: ["2024-01-01","2024-02-09","2024-02-12","2024-03-01","2024-04-10","2024-05-05","2024-05-06","2024-06-06","2024-08-15","2024-09-16","2024-09-17","2024-09-18","2024-10-03","2024-10-09","2024-12-25"],
  2025: ["2025-01-01","2025-01-28","2025-01-29","2025-01-30","2025-03-01","2025-05-05","2025-06-06","2025-08-15","2025-10-03","2025-10-06","2025-10-09","2025-12-25"],
  2026: ["2026-01-01","2026-02-16","2026-02-17","2026-03-01","2026-05-05","2026-05-25","2026-06-06","2026-08-15","2026-09-24","2026-10-03","2026-10-09","2026-12-25"]
};

async function loadYearHolidays(year){
  try{
    const snap = await getDoc(doc(db, "holidays", String(year)));
    const base = STATIC_HOLIDAYS[year] || [];
    if (snap.exists()) {
      const days = Array.isArray(snap.data().days) ? snap.data().days : [];
      return new Set([...base, ...days]);
    }
    return new Set(base);
  } catch { return new Set(STATIC_HOLIDAYS[year] || []); }
}

// 평일 수 계산(주말/공휴일 제외)
async function countBusinessDays(start, end) {
  let d = new Date(start);
  const endD = new Date(end);
  const years = new Set();
  for (let y=d.getFullYear(); y<=endD.getFullYear(); y++) years.add(y);
  const holidaySets = {};
  for (const y of years) holidaySets[y] = await loadYearHolidays(y);

  let cnt = 0;
  while (d <= endD) {
    const y = d.getFullYear();
    const ymd = fmt(d);
    if (!isWeekend(d) && !holidaySets[y].has(ymd)) cnt++;
    d = addDays(d, 1);
  }
  return cnt;
}

export async function renderMMPage(container){
  container.innerHTML = `
    <div class="bg-white dark:bg-gray-900 p-4 md:p-6 rounded-xl shadow-sm">
      <div class="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">시작일</label>
          <input id="mm-start" type="date" class="rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
        </div>
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">종료일</label>
          <input id="mm-end" type="date" class="rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
        </div>
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">팀 필터</label>
          <input id="mm-filter-team" class="w-40 rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
        </div>
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">이름 검색</label>
          <input id="mm-filter-name" class="w-40 rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
        </div>
        <button id="mm-run" class="rounded-lg bg-primary text-white px-4 py-2 h-10">계산</button>
        <button id="mm-export" class="rounded-lg border px-3 py-2 h-10 dark:border-gray-700">CSV 내보내기</button>
      </div>

      <div id="mm-summary" class="mb-3 text-sm text-gray-600 dark:text-gray-300"></div>
      <div id="mm-table" class="table-scroll border rounded-lg"></div>
    </div>
  `;

  const startEl = document.getElementById("mm-start");
  const endEl = document.getElementById("mm-end");
  const filterTeamEl = document.getElementById("mm-filter-team");
  const filterNameEl = document.getElementById("mm-filter-name");

  // 기본: 이번 달
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth()+1, 0);
  startEl.value = fmt(first);
  endEl.value = fmt(last);

  async function run(){
    const s = parseYmd(startEl.value);
    const e = parseYmd(endEl.value);
    if (e < s) { alert("종료일이 시작일보다 빠릅니다."); return; }

    // 데이터 로드
    const empSnaps = await getDocs(collection(db, "employees"));
    let employees = [];
    empSnaps.forEach(d=> employees.push({ id:d.id, ...d.data() }));

    const asSnaps = await getDocs(collection(db, "assignments"));
    const assigns = [];
    asSnaps.forEach(d=> assigns.push({ id:d.id, ...d.data() }));

    // 필터
    const teamFilter = filterTeamEl.value.trim();
    const nameFilter = filterNameEl.value.trim();
    if (teamFilter) employees = employees.filter(e=> (e.team||"").includes(teamFilter));
    if (nameFilter) employees = employees.filter(e=> (e.name||"").includes(nameFilter));

    // 기준 평일 일수
    const bizDays = await countBusinessDays(s, e);

    // 직원별 MM 계산
    const rows = employees.map(emp=>{
      // 해당 기간과 겹치는 assignment만
      const mine = assigns.filter(a=> a.empId===emp.id);
      // 일자별 합산(간단화: 겹치는 일자는 allocation 합으로 1일 대비 비율)
      // 총 MM = (기간 평일 수 대비) 평균 allocation 합
      let totalAllocDays = 0;

      // 날짜 루프 (성능: 기간 길어져도 일반 사내 사용 수준에선 문제없음)
      let d = new Date(s);
      while (d <= e) {
        if (!isWeekend(d)) {
          const y = d.getFullYear();
          // 공휴일 제외
          // (연도별 캐시는 countBusinessDays에서만 했지만, 여기서는 빠른 대략치로 STATIC만 사용)
          const ymd = fmt(d);
          const staticList = STATIC_HOLIDAYS[y] || [];
          if (!staticList.includes(ymd)) {
            // 그 날짜에 걸친 allocation 합
            let sum = 0;
            for (const a of mine) {
              if (ymd >= a.startDate && ymd <= a.endDate) sum += (a.allocation || 1);
            }
            if (sum > 0) totalAllocDays += Math.min(sum, 1); // 하루 최대 1일치로 캡
          }
        }
        d = addDays(d, 1);
      }

      const mm = bizDays ? (totalAllocDays / bizDays) : 0;
      return {
        id: emp.id, name: emp.name || "", team: emp.team || "",
        rank: emp.rank || "", status: emp.status || "", evalGrade: emp.evalGrade || "",
        MM: +mm.toFixed(3)
      };
    });

    rows.sort((a,b)=> (a.team||"").localeCompare(b.team||"") || (a.name||"").localeCompare(b.name||""));

    document.getElementById("mm-summary").innerHTML = `
      기준: ${fmt(s)} ~ ${fmt(e)} (평일 ${bizDays}일)
      <span class="mm-badge ml-2">총 인원 ${rows.length}명</span>
    `;

    document.getElementById("mm-table").innerHTML = `
      <table class="min-w-full text-sm">
        <thead class="text-left bg-gray-50 dark:bg-gray-800">
          <tr>
            <th class="py-2 px-3">팀</th>
            <th class="py-2 px-3">이름</th>
            <th class="py-2 px-3">직급</th>
            <th class="py-2 px-3">상태</th>
            <th class="py-2 px-3">평가</th>
            <th class="py-2 px-3">MM</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r=>`
            <tr class="border-b border-gray-100 dark:border-gray-800">
              <td class="py-2 px-3">${r.team}</td>
              <td class="py-2 px-3">${r.name}</td>
              <td class="py-2 px-3">${r.rank}</td>
              <td class="py-2 px-3">${r.status}</td>
              <td class="py-2 px-3">${r.evalGrade}</td>
              <td class="py-2 px-3 font-semibold">${r.MM}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    // CSV export
    document.getElementById("mm-export").onclick = ()=>{
      const header = ["team","name","rank","status","evalGrade","MM"];
      const csv = [header.join(",")].concat(
        rows.map(r=> header.map(h=> (r[h]??"")).join(","))
      ).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `mm_${fmt(s)}_${fmt(e)}.csv`;
      a.click();
    };
  }

  document.getElementById("mm-run").onclick = run;
  await run();
}
