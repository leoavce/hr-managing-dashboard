// js/calendar.js
// 변경 사항 요약
// - 역할 칼럼 제거, 행의 이름 아래에 "역할" 표시(직원 primaryRole 사용, 없으면 기간 내 배정의 역할들 요약)
// - 상단 툴바에 글로벌 버튼 추가: "업무 배정" / "역할 편집"
//   · 업무 배정: 여러 인원을 선택해 동일 업무/기간/투입률 배정
//   · 역할 편집: 여러 인원의 primaryRole 일괄 수정
// - 헤더: 1행 = 월(연-월, 월별로 스팬), 2행 = 요일/날짜(촘촘)
// - 셀 폭 32px로 축소, 주말 제외, 공휴일 붉은색
// - 동일 업무는 연속 스팬 막대로 1개만 표시(막대 클릭으로 수정/삭제)

import { db } from "./firebase.js";
import {
  collection, getDocs, addDoc, doc, setDoc, getDoc, updateDoc, deleteDoc, query, where
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

// ===== 날짜 유틸 =====
function fmt(d){ return d.toISOString().slice(0,10); }
function parseYmd(s){ const [y,m,dd]=s.split("-").map(Number); return new Date(y, m-1, dd); }
function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function isWeekend(d){ const day=d.getDay(); return day===0 || day===6; }
const DAYNAMES = ["일","월","화","수","목","금","토"];

// ===== 화면 상태 =====
let viewStartDate = new Date();
// 44 영업일 ≒ 2개월 평일 기준(주말 제외)
const VIEW_WORKDAYS = 44;
const CELL_PX = 32; // styles.css와 동일 값

// ===== 한국 공휴일(샘플) + Firestore 병합 =====
const STATIC_HOLIDAYS = {
  2024: ["2024-01-01","2024-02-09","2024-02-12","2024-03-01","2024-04-10","2024-05-05","2024-05-06","2024-06-06","2024-08-15","2024-09-16","2024-09-17","2024-09-18","2024-10-03","2024-10-09","2024-12-25"],
  2025: ["2025-01-01","2025-01-28","2025-01-29","2025-01-30","2025-03-01","2025-05-05","2025-06-06","2025-08-15","2025-10-03","2025-10-06","2025-10-09","2025-12-25"],
  2026: ["2026-01-01","2026-02-16","2026-02-17","2026-03-01","2026-05-05","2026-05-25","2026-06-06","2026-08-15","2026-09-24","2026-10-03","2026-10-09","2026-12-25"]
};

async function loadYearHolidays(year){
  try{
    const ref = doc(db, "holidays", String(year));
    const snap = await getDoc(ref);
    const base = STATIC_HOLIDAYS[year] || [];
    if (snap.exists()) {
      const days = Array.isArray(snap.data().days) ? snap.data().days : [];
      return Array.from(new Set([...base, ...days])).sort();
    }
    return base;
  } catch {
    return STATIC_HOLIDAYS[year] || [];
  }
}

// 평일만 포함하되, 공휴일은 표시 목적상 포함(헤더/셀 강조)
async function getWeekdaysIncludingHolidays(startDate, targetCount) {
  const out = [];
  let d = new Date(startDate);

  // 미리 연도별 휴일 세트 준비
  const holidayMap = {};
  const collectYears = new Set();
  const probeEnd = addDays(d, targetCount * 2);
  for (let y=d.getFullYear(); y<=probeEnd.getFullYear(); y++) collectYears.add(y);
  for (const y of collectYears) holidayMap[y] = new Set(await loadYearHolidays(y));

  while (out.length < targetCount) {
    if (!isWeekend(d)) {
      out.push({ date: new Date(d), isHoliday: holidayMap[d.getFullYear()].has(fmt(d)) });
    }
    d = addDays(d, 1);
  }
  return out;
}

// 직원 로드(전체)
async function loadEmployees(){
  const snaps = await getDocs(collection(db, "employees"));
  const arr = [];
  snaps.forEach(d=> arr.push({ id:d.id, ...d.data() }));
  arr.sort((a,b)=> (a.team||"").localeCompare(b.team||"") || (a.name||"").localeCompare(b.name||""));
  return arr;
}

// 기간 내 배정 로드
async function loadAssignmentsInRange(startYmd, endYmd, empIds) {
  const col = collection(db, "assignments");
  const snaps = await getDocs(col);
  const s = parseYmd(startYmd);
  const e = parseYmd(endYmd);
  const byEmp = {};
  snaps.forEach(d=>{
    const a = d.data();
    if (!empIds.includes(a.empId)) return;
    const as = parseYmd(a.startDate);
    const ae = parseYmd(a.endDate);
    if (ae >= s && as <= e) {
      if (!byEmp[a.empId]) byEmp[a.empId] = [];
      byEmp[a.empId].push({ id: d.id, ...a });
    }
  });
  // 같은 업무(task) & 역할(role)이 이어지는 경우 병합(연속일자)
  for (const k of Object.keys(byEmp)) {
    const list = byEmp[k].sort((a,b)=> (a.startDate||"").localeCompare(b.startDate||""));
    const merged = [];
    for (const item of list) {
      const last = merged[merged.length-1];
      if (last && last.task===item.task && (last.role||"")=== (item.role||"")
          && addDays(parseYmd(last.endDate),1).toISOString().slice(0,10) === item.startDate) {
        // 연속이면 끝만 확장
        last.endDate = item.endDate > last.endDate ? item.endDate : last.endDate;
        last.allocation = Math.max(last.allocation||1, item.allocation||1); // 보수적 병합
      } else {
        merged.push({...item});
      }
    }
    byEmp[k] = merged;
  }
  return byEmp;
}

// ===== 글로벌 모달(업무 배정 / 역할 편집) =====
function openBulkAssignModal({ employees, onAssigned }) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4";
  overlay.innerHTML = `
    <div class="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-xl shadow-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">업무 배정</h3>
        <button class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" data-close>&times;</button>
      </div>

      <div class="grid md:grid-cols-2 gap-4">
        <div>
          <div class="mb-2">
            <label class="block text-sm mb-1">인원 선택</label>
            <input id="emp-filter" placeholder="이름/팀 검색" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm mb-2"/>
            <div id="emp-list" class="max-h-64 overflow-auto border rounded-lg p-2"></div>
          </div>
        </div>
        <div class="space-y-3">
          <div>
            <label class="block text-sm mb-1">업무(Task)</label>
            <input id="bulk-task" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" placeholder="업무 요약"/>
          </div>
          <div>
            <label class="block text-sm mb-1">역할(Role)</label>
            <input id="bulk-role" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" placeholder="예: 인프라/보안"/>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm mb-1">시작일</label>
              <input id="bulk-start" type="date" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
            </div>
            <div>
              <label class="block text-sm mb-1">종료일</label>
              <input id="bulk-end" type="date" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
            </div>
          </div>
          <div>
            <label class="block text-sm mb-1">투입 비율 (0~1)</label>
            <input id="bulk-alloc" type="number" min="0" max="1" step="0.1" value="1" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
          </div>
          <div class="text-xs text-gray-500">선택된 각 인원에게 동일한 배정을 생성합니다.</div>
        </div>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button class="rounded-lg border px-3 py-1.5" data-close>취소</button>
        <button id="bulk-save" class="rounded-lg bg-primary text-white px-4 py-1.5">저장</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = ()=> overlay.remove();
  overlay.querySelectorAll("[data-close]").forEach(b=> b.addEventListener("click", close));

  const empListEl = overlay.querySelector("#emp-list");
  const filterEl = overlay.querySelector("#emp-filter");
  function renderEmpList(keyword=""){
    const kw = keyword.trim();
    const items = employees.filter(e=>
      !kw || (e.name||"").includes(kw) || (e.team||"").includes(kw)
    );
    empListEl.innerHTML = items.map(e=>`
      <label class="flex items-center gap-2 py-1">
        <input type="checkbox" value="${e.id}"/>
        <span class="text-sm">${e.name} <span class="text-xs text-gray-500">(${e.team||"미지정"})</span></span>
      </label>
    `).join("");
  }
  renderEmpList();
  filterEl.addEventListener("input", e=> renderEmpList(e.target.value));

  overlay.querySelector("#bulk-save").addEventListener("click", async ()=>{
    const ids = Array.from(empListEl.querySelectorAll("input[type=checkbox]:checked")).map(i=> i.value);
    if (!ids.length) { alert("인원을 선택하세요."); return; }
    const task = overlay.querySelector("#bulk-task").value.trim();
    const role = overlay.querySelector("#bulk-role").value.trim();
    const startDate = overlay.querySelector("#bulk-start").value;
    const endDate = overlay.querySelector("#bulk-end").value;
    const allocation = parseFloat(overlay.querySelector("#bulk-alloc").value || "1") || 1;
    if (!task || !startDate || !endDate) { alert("업무/기간을 입력하세요."); return; }

    for (const id of ids) {
      await addDoc(collection(db, "assignments"), { empId: id, task, role, startDate, endDate, allocation });
    }
    close();
    await onAssigned();
  });
}

function openBulkRoleModal({ employees, onUpdated }) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4";
  overlay.innerHTML = `
    <div class="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">역할 편집</h3>
        <button class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" data-close>&times;</button>
      </div>

      <div class="mb-2">
        <label class="block text-sm mb-1">인원 선택</label>
        <input id="role-filter" placeholder="이름/팀 검색" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm mb-2"/>
        <div id="role-list" class="max-h-64 overflow-auto border rounded-lg p-2"></div>
      </div>

      <div class="mb-2">
        <label class="block text-sm mb-1">역할(Role)</label>
        <input id="role-value" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" placeholder="예: 인프라/보안"/>
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button class="rounded-lg border px-3 py-1.5" data-close>취소</button>
        <button id="role-save" class="rounded-lg bg-primary text-white px-4 py-1.5">저장</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = ()=> overlay.remove();
  overlay.querySelectorAll("[data-close]").forEach(b=> b.addEventListener("click", close));

  const listEl = overlay.querySelector("#role-list");
  const filterEl = overlay.querySelector("#role-filter");
  function renderList(keyword=""){
    const kw = keyword.trim();
    const items = employees.filter(e=>
      !kw || (e.name||"").includes(kw) || (e.team||"").includes(kw)
    );
    listEl.innerHTML = items.map(e=>`
      <label class="flex items-center gap-2 py-1">
        <input type="checkbox" value="${e.id}"/>
        <span class="text-sm">${e.name} <span class="text-xs text-gray-500">(${e.team||"미지정"})</span></span>
      </label>
    `).join("");
  }
  renderList();
  filterEl.addEventListener("input", e=> renderList(e.target.value));

  overlay.querySelector("#role-save").addEventListener("click", async ()=>{
    const ids = Array.from(listEl.querySelectorAll("input[type=checkbox]:checked")).map(i=> i.value);
    if (!ids.length) { alert("인원을 선택하세요."); return; }
    const val = overlay.querySelector("#role-value").value.trim();
    if (!val) { alert("역할을 입력하세요."); return; }

    for (const id of ids) {
      await updateDoc(doc(db, "employees", id), { primaryRole: val });
    }
    close();
    await onUpdated();
  });
}

// ===== 개별 수정 모달(스팬 클릭) =====
function openAssignModal({ emp, initial, onSubmit, onDelete }) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4";
  overlay.innerHTML = `
    <div class="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-lg p-4">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">업무 ${initial ? "수정" : "배정"}</h3>
        <button class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" data-close>&times;</button>
      </div>
      <div class="text-xs text-gray-500 mb-3">${emp.name} · ${emp.team}</div>
      <div class="space-y-3">
        <div>
          <label class="block text-sm mb-1">업무(Task)</label>
          <input id="assign-task" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
        </div>
        <div>
          <label class="block text-sm mb-1">역할(Role)</label>
          <input id="assign-role" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm mb-1">시작일</label>
            <input id="assign-start" type="date" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
          </div>
          <div>
            <label class="block text-sm mb-1">종료일</label>
            <input id="assign-end" type="date" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
          </div>
        </div>
        <div>
          <label class="block text-sm mb-1">투입 비율 (0~1)</label>
          <input id="assign-alloc" type="number" min="0" max="1" step="0.1" value="1" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
        </div>
      </div>
      <div class="flex justify-between gap-2 mt-4">
        <div>
          ${initial ? `<button id="assign-delete" class="rounded-lg border px-3 py-1.5 text-rose-600 border-rose-300">삭제</button>` : ""}
        </div>
        <div class="flex gap-2">
          <button class="rounded-lg border px-3 py-1.5" data-close>취소</button>
          <button class="rounded-lg bg-primary text-white px-4 py-1.5" id="assign-save">저장</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = ()=> overlay.remove();
  overlay.querySelectorAll("[data-close]").forEach(b=> b.addEventListener("click", close));

  const taskEl = overlay.querySelector("#assign-task");
  const roleEl = overlay.querySelector("#assign-role");
  const startEl = overlay.querySelector("#assign-start");
  const endEl = overlay.querySelector("#assign-end");
  const allocEl = overlay.querySelector("#assign-alloc");

  if (initial) {
    taskEl.value = initial.task || "";
    roleEl.value = initial.role || "";
    startEl.value = initial.startDate || "";
    endEl.value = initial.endDate || "";
    allocEl.value = (initial.allocation ?? 1);
  }

  overlay.querySelector("#assign-save").addEventListener("click", async ()=>{
    const payload = {
      task: taskEl.value.trim(),
      role: roleEl.value.trim(),
      startDate: startEl.value,
      endDate: endEl.value,
      allocation: parseFloat(allocEl.value || "1") || 1
    };
    if (!payload.task || !payload.startDate || !payload.endDate) { alert("업무/기간을 입력하세요."); return; }
    await onSubmit(payload);
    close();
  });

  if (initial) {
    overlay.querySelector("#assign-delete").addEventListener("click", async ()=>{
      if (!confirm("이 업무 배정을 삭제할까요?")) return;
      await onDelete();
      close();
    });
  }
}

// ===== 렌더링 =====
export async function renderCalendarPage(container){
  container.innerHTML = `
    <div class="bg-white dark:bg-gray-900 p-4 md:p-6 rounded-xl shadow-sm">
      <div class="flex items-center justify-between gap-2 mb-4">
        <div class="flex items-center gap-2">
          <button id="prev-month" class="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full p-2" title="이전">
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <button id="next-month" class="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full p-2" title="다음">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
          <button id="today-btn" class="text-sm rounded-lg border px-3 py-1.5 dark:border-gray-700">오늘</button>
          <input type="date" id="start-date" class="rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm ml-2"/>
          <button id="apply-range" class="text-sm rounded-lg bg-primary text-white px-3 py-1.5">적용</button>
        </div>
        <div class="flex items-center gap-2">
          <button id="bulk-assign" class="text-sm rounded-lg border px-3 py-1.5 dark:border-gray-700">업무 배정</button>
          <button id="bulk-role" class="text-sm rounded-lg border px-3 py-1.5 dark:border-gray-700">역할 편집</button>
          <button id="add-holiday" class="text-sm rounded-lg border px-3 py-1.5 dark:border-gray-700">휴일 추가</button>
        </div>
      </div>

      <!-- 헤더(월/요일·날짜) -->
      <div id="calendar-header" class="horizontal-calendar-scroll"></div>

      <!-- 본문 -->
      <div id="calendar-wrap" class="horizontal-calendar-scroll"></div>
    </div>
  `;

  const startInput = document.getElementById("start-date");
  startInput.value = fmt(viewStartDate);

  document.getElementById("prev-month").onclick = () => {
    viewStartDate = addDays(viewStartDate, -28); startInput.value = fmt(viewStartDate); draw();
  };
  document.getElementById("next-month").onclick = () => {
    viewStartDate = addDays(viewStartDate, 28); startInput.value = fmt(viewStartDate); draw();
  };
  document.getElementById("today-btn").onclick = () => {
    viewStartDate = new Date(); startInput.value = fmt(viewStartDate); draw();
  };
  document.getElementById("apply-range").onclick = () => {
    viewStartDate = parseYmd(startInput.value); draw();
  };

  document.getElementById("add-holiday").onclick = async ()=>{
    const ymd = prompt("추가할 휴일(YYYY-MM-DD):");
    if (!ymd) return;
    const y = ymd.slice(0,4);
    const ref = doc(db, "holidays", y);
    const snap = await getDoc(ref);
    const days = snap.exists() && Array.isArray(snap.data().days) ? snap.data().days : [];
    if (!days.includes(ymd)) {
      await setDoc(ref, { days: [...days, ymd] }, { merge:true });
      alert("추가됨");
      draw(); // 즉시 반영
    } else {
      alert("이미 존재하는 날짜");
    }
  };

  // 글로벌 모달 버튼
  document.getElementById("bulk-assign").onclick = async ()=>{
    const employees = await loadEmployees();
    openBulkAssignModal({
      employees,
      onAssigned: async ()=> { await draw(); }
    });
  };
  document.getElementById("bulk-role").onclick = async ()=>{
    const employees = await loadEmployees();
    openBulkRoleModal({
      employees,
      onUpdated: async ()=> { await draw(); }
    });
  };

  async function draw(){
    // 날짜들(평일만, 공휴일 표시 플래그 포함)
    const days = await getWeekdaysIncludingHolidays(viewStartDate, VIEW_WORKDAYS);
    const startYmd = fmt(days[0].date);
    const endYmd = fmt(days[days.length-1].date);

    // 직원/배정 로드
    const employees = await loadEmployees();
    const empIds = employees.map(e=>e.id);
    const assignmentsByEmp = await loadAssignmentsInRange(startYmd, endYmd, empIds);

    // ===== 헤더 렌더 =====
    const headerHost = document.getElementById("calendar-header");
    headerHost.innerHTML = "";
    // 1행: 월 스팬
    const monthRow = document.createElement("div");
    monthRow.className = "flex calendar-header-sticky border-b border-gray-200 dark:border-gray-800";

    const memberHead = document.createElement("div");
    memberHead.className = "calendar-left-sticky member-col px-3 py-2 font-bold text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800";
    memberHead.textContent = "팀원 (이름 / 역할)";
    monthRow.appendChild(memberHead);

    // 월 별 그룹
    const monthGroups = [];
    for (let i=0;i<days.length;i++){
      const d = days[i].date;
      const key = `${d.getFullYear()}-${d.getMonth()+1}`;
      const prev = monthGroups[monthGroups.length-1];
      if (!prev || prev.key !== key) {
        monthGroups.push({ key, y: d.getFullYear(), m: d.getMonth()+1, count: 1 });
      } else {
        prev.count++;
      }
    }
    monthGroups.forEach(gr=>{
      const el = document.createElement("div");
      el.style.width = `${gr.count * CELL_PX}px`;
      el.className = "px-1 py-2 text-center text-sm font-bold text-gray-700 dark:text-gray-200";
      el.textContent = `${gr.y}.${String(gr.m).padStart(2,"0")}`;
      monthRow.appendChild(el);
    });
    headerHost.appendChild(monthRow);

    // 2행: 요일/날짜
    const dayRow = document.createElement("div");
    dayRow.className = "flex calendar-header-sticky border-b border-gray-200 dark:border-gray-800";
    const memberPad = document.createElement("div");
    memberPad.className = "calendar-left-sticky member-col px-3 py-2 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800";
    memberPad.innerHTML = `<div class="text-xs text-gray-500">더블클릭: 해당일 업무 배정</div>`;
    dayRow.appendChild(memberPad);

    days.forEach(({date, isHoliday})=>{
      const ymd = fmt(date);
      const el = document.createElement("div");
      el.className = "calendar-cell px-0 py-1 text-center text-[11px] font-medium text-gray-700 dark:text-gray-200";
      el.innerHTML = `${DAYNAMES[date.getDay()]}<br>${date.getDate()}`;
      if (isHoliday) el.classList.add("holiday-label","holiday-bg");
      dayRow.appendChild(el);
    });
    headerHost.appendChild(dayRow);

    // ===== 본문 렌더 =====
    const wrap = document.getElementById("calendar-wrap");
    wrap.innerHTML = "";

    employees.forEach(emp=>{
      const row = document.createElement("div");
      row.className = "row-track border-b border-gray-100 dark:border-gray-800";

      // 좌측(팀원+역할)
      const left = document.createElement("div");
      left.className = "calendar-left-sticky member-col px-3 py-2 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800";
      // 역할: employee.primaryRole 우선, 없으면 기간 내 배정 역할들의 유니크 요약
      const roles = new Set();
      (assignmentsByEmp[emp.id]||[]).forEach(a=> { if (a.role) roles.add(a.role); });
      const roleText = emp.primaryRole || (roles.size ? Array.from(roles).slice(0,3).join(", ") : "-");

      left.innerHTML = `
        <div class="text-sm font-semibold text-gray-900 dark:text-white">${emp.name} <span class="text-xs text-gray-500">(${emp.team||"미지정"})</span></div>
        <div class="text-xs text-gray-600 dark:text-gray-400">역할: ${roleText}</div>
      `;
      row.appendChild(left);

      // 데이터 셀 (빈 셀들: 클릭/더블클릭 이벤트용)
      const dataHost = document.createElement("div");
      dataHost.className = "flex";
      days.forEach(({date, isHoliday})=>{
        const ymd = fmt(date);
        const cell = document.createElement("div");
        cell.className = "calendar-cell";
        if (isHoliday) cell.classList.add("holiday-bg");

        // 더블클릭 시 해당 일자부터 기본 배정 모달
        cell.addEventListener("dblclick", ()=>{
          openAssignModal({
            emp,
            initial: { task:"", role: emp.primaryRole || "", startDate: ymd, endDate: ymd, allocation: 1 },
            onSubmit: async (p)=> {
              await addDoc(collection(db, "assignments"), { empId: emp.id, ...p });
              await renderCalendarPage(container);
            }
          });
        });

        dataHost.appendChild(cell);
      });
      row.appendChild(dataHost);

      // ===== 연속 스팬 막대 깔기 (absolute) =====
      const rangeAssignments = assignmentsByEmp[emp.id] || [];
      // 스팬 생성 함수
      function addSpan(a){
        // 캘린더 범위 내로 절단
        const startIdx = Math.max(0, days.findIndex(d=> fmt(d.date) >= a.startDate));
        const endIdx = Math.min(days.length-1, (()=> {
          let idx = -1;
          for (let i=days.length-1;i>=0;i--) { if (fmt(days[i].date) <= a.endDate) { idx = i; break; } }
          return idx;
        })());
        if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) return;

        const span = document.createElement("div");
        span.className = "task-span";
        const width = (endIdx - startIdx + 1) * CELL_PX - 4; // -4 padding
        const leftPx = startIdx * CELL_PX + (document.querySelector(".member-col")?.offsetWidth || 260); // 좌측 스티키 폭만큼 이동
        span.style.left = `${leftPx + 2}px`;
        span.style.width = `${width}px`;
        span.title = `${a.task} (${a.role||"-"}) ${a.startDate}~${a.endDate} · ${Math.round((a.allocation||1)*100)}%`;

        // 클릭 → 수정/삭제
        span.addEventListener("click", ()=>{
          openAssignModal({
            emp, initial: a,
            onSubmit: async (p)=> {
              await updateDoc(doc(db, "assignments", a.id), { ...a, ...p });
              await renderCalendarPage(container);
            },
            onDelete: async ()=>{
              await deleteDoc(doc(db, "assignments", a.id));
              await renderCalendarPage(container);
            }
          });
        });

        // 행(row-track) 기준 absolute이므로 row에 붙임
        row.appendChild(span);
      }

      rangeAssignments.forEach(addSpan);
      wrap.appendChild(row);
    });
  }

  await draw();
}
