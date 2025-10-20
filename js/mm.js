// js/mm.js
// Man-Month 계산 페이지

import { db } from "./firebase.js";
import { requireAuthAndTeams } from "./auth.js";
import {
  collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

function fmt(d){ return d.toISOString().slice(0,10); }
function parseYmd(s){ const [y,m,dd]=s.split("-").map(Number); return new Date(y, m-1, dd); }
function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function isWeekend(d){ const day=d.getDay(); return day===0 || day===6; }

async function loadHolidays(year, STATIC_HOLIDAYS) {
  // calendar.js에서와 중복 로직을 피하려면 공용 유틸로 빼도 됨 (여기선 독립 구현)
  try {
    const docUrl = `holidays/${year}`;
    const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js");
    const ref = doc(db, "holidays", String(year));
    const snap = await getDoc(ref);
    const base = (STATIC_HOLIDAYS[year]||[]);
    if (snap.exists()) {
      const days = Array.isArray(snap.data().days) ? snap.data().days : [];
      return Array.from(new Set([...base, ...days]));
    }
    return base;
  } catch {
    return (STATIC_HOLIDAYS[year]||[]);
  }
}

async function businessDatesBetween(startDate, endDate, STATIC_HOLIDAYS) {
  const days = [];
  let d = new Date(startDate);
  const years = new Set();
  for (let y=d.getFullYear(); y<=endDate.getFullYear(); y++) years.add(y);
  const holiMap = {};
  for (const y of years) holiMap[y] = new Set(await loadHolidays(y, STATIC_HOLIDAYS));

  while (d <= endDate) {
    const ymd = fmt(d);
    const isHol = holiMap[d.getFullYear()]?.has(ymd) || false;
    if (!isWeekend(d) && !isHol) days.push(fmt(d));
    d = addDays(d, 1);
  }
  return days;
}

export async function renderManMonthPage(container){
  container.innerHTML = `
    <div class="bg-white dark:bg-gray-900 p-4 md:p-6 rounded-xl shadow-sm">
      <div class="flex items-end gap-3 mb-4">
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">시작일</label>
          <input type="date" id="mm-start" class="rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
        </div>
        <div>
          <label class="block text-sm text-gray-600 dark:text-gray-300">종료일</label>
          <input type="date" id="mm-end" class="rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
        </div>
        <button id="mm-calc" class="rounded-lg bg-primary text-white px-4 py-2">계산</button>
      </div>
      <div id="mm-result" class="text-sm text-gray-800 dark:text-gray-100"></div>
    </div>
  `;

  const startEl = document.getElementById("mm-start");
  const endEl = document.getElementById("mm-end");
  const resEl = document.getElementById("mm-result");

  const today = new Date();
  startEl.value = fmt(addDays(today, -28));
  endEl.value = fmt(today);

  const STATIC_HOLIDAYS = {
    2024: ["2024-01-01","2024-02-09","2024-02-12","2024-03-01","2024-04-10","2024-05-05","2024-05-06","2024-06-06","2024-08-15","2024-09-16","2024-09-17","2024-09-18","2024-10-03","2024-10-09","2024-12-25"],
    2025: ["2025-01-01","2025-01-28","2025-01-29","2025-01-30","2025-03-01","2025-05-05","2025-06-06","2025-08-15","2025-10-03","2025-10-06","2025-10-09","2025-12-25"],
    2026: ["2026-01-01","2026-02-16","2026-02-17","2026-03-01","2026-05-05","2026-05-25","2026-06-06","2026-08-15","2026-09-24","2026-10-03","2026-10-09","2026-12-25"]
  };

  document.getElementById("mm-calc").onclick = async ()=>{
    const s = parseYmd(startEl.value);
    const e = parseYmd(endEl.value);
    if (e < s) { alert("종료일이 시작일보다 빠릅니다."); return; }

    // 기준 영업일 목록
    const bizDays = await businessDatesBetween(s, e, STATIC_HOLIDAYS);
    const baseCount = bizDays.length || 1;

    // assignments 전량 로드 후 기간내 겹침만 계산 (규모 커지면 인덱싱 권장)
    const assignsSnap = await getDocs(collection(db, "assignments"));
    const empTotals = {}; // empId -> 투입일수 합(비율 반영)
    assignsSnap.forEach(d=>{
      const a = d.data();
      const as = parseYmd(a.startDate);
      const ae = parseYmd(a.endDate);
      // 기간 겹침 필터
      const start = as > s ? as : s;
      const end = ae < e ? ae : e;
      if (end < start) return;

      const alloc = typeof a.allocation === "number" ? a.allocation : 1;
      // 영업일 교집합 카운트 (간단 구현)
      let count = 0;
      for (const ymd of bizDays) {
        const d0 = parseYmd(ymd);
        if (d0 >= start && d0 <= end) count++;
      }
      const add = count * alloc;
      empTotals[a.empId] = (empTotals[a.empId] || 0) + add;
    });

    // 사람별 MM = 투입일수 / 기준영업일수
    const rows = Object.entries(empTotals).map(([empId, days])=>({
      empId,
      days,
      mm: +(days / baseCount).toFixed(3)
    }));

    const totalMM = rows.reduce((acc, r)=> acc + r.mm, 0);
    rows.sort((a,b)=> b.mm - a.mm);

    resEl.innerHTML = `
      <div class="mb-3 text-gray-700 dark:text-gray-200">기준 영업일수: <b>${baseCount}</b>일</div>
      <div class="overflow-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left">
            <tr class="border-b border-gray-200 dark:border-gray-700">
              <th class="py-2 pr-4">직원ID</th>
              <th class="py-2 pr-4 text-right">투입일수(가중)</th>
              <th class="py-2 pr-4 text-right">MM</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r=>`
              <tr class="border-b border-gray-50 dark:border-gray-800">
                <td class="py-2 pr-4">${r.empId}</td>
                <td class="py-2 pr-4 text-right">${r.days.toFixed(2)}</td>
                <td class="py-2 pr-4 text-right font-semibold">${r.mm.toFixed(3)}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr>
              <td class="py-2 pr-4 font-semibold">합계</td>
              <td></td>
              <td class="py-2 pr-4 text-right font-bold">${totalMM.toFixed(3)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  };
}
