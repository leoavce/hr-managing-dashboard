// js/calendar.js
// 요구 반영:
// - 팀원 목록이 달력에 표기되지 않던 문제 수정 (로드/렌더링 경로 안정화)
// - 업무 상태 편집 버튼(행 단위) + 셀 더블클릭 편집
// - 한국 공휴일 자동 붉은색 표시 (해당 평일을 "보여주되" 빨간 배경/라벨)
// - 주말 제외
// - 가로로 1~2달 보이도록 셀 폭 축소
// - 휴일 추가 시 즉시 붉게 반영

import { db } from "./firebase.js";
import { requireAuthAndTeams } from "./auth.js";
import {
  collection, getDocs, addDoc, doc, setDoc, getDoc, updateDoc, deleteDoc, query, where
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

// 날짜 유틸
function fmt(d){ return d.toISOString().slice(0,10); }
function parseYmd(s){ const [y,m,dd]=s.split("-").map(Number); return new Date(y, m-1, dd); }
function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function isWeekend(d){ const day=d.getDay(); return day===0 || day===6; }
const DAYNAMES = ["일","월","화","수","목","금","토"];

// 화면 상태
let viewStartDate = new Date();
// 44 영업일 ≒ 2개월 평일 기준
const VIEW_WORKDAYS = 44;

// 한국 공휴일(샘플) + Firestore 병합
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

// 평일(월~금)만 포함하되, 공휴일은 "표시" 목적상 포함해서 컬럼 생성 (빨간색 표시)
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
      // 평일이면 포함. 공휴일이면 표시만 다르게.
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
  return byEmp;
}

// 업무 배정 모달
function openAssignModal({ emp, dateYmd, initial, onSubmit, onDelete }) {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4";
  overlay.innerHTML = `
    <div class="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-lg p-4">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">${initial ? "업무 수정" : "업무 배정"}</h3>
        <button class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" data-close>&times;</button>
      </div>
      <div class="text-xs text-gray-500 mb-3">${emp.name} · ${emp.team} · 기준일: ${dateYmd}</div>
      <div class="space-y-3">
        <div>
          <label class="block text-sm mb-1">역할</label>
          <input id="assign-role" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" placeholder="예: 인프라/보안"/>
        </div>
        <div>
          <label class="block text-sm mb-1">업무 내용</label>
          <input id="assign-task" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" placeholder="업무 요약"/>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm mb-1">시작일</label>
            <input id="assign-start" type="date" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
          </div>
          <div>
            <label class="block text-sm mb-1">종료일</label>
            <input id="assign-end" type="date" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
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

  const roleEl = overlay.querySelector("#assign-role");
  const taskEl = overlay.querySelector("#assign-task");
  const startEl = overlay.querySelector("#assign-start");
  const endEl = overlay.querySelector("#assign-end");
  const allocEl = overlay.querySelector("#assign-alloc");

  if (initial) {
    roleEl.value = initial.role || "";
    taskEl.value = initial.task || "";
    startEl.value = initial.startDate || dateYmd;
    endEl.value = initial.endDate || dateYmd;
    allocEl.value = (initial.allocation ?? 1);
  } else {
    startEl.value = dateYmd;
    endEl.value = dateYmd;
  }

  overlay.querySelector("#assign-save").addEventListener("click", async ()=>{
    const payload = {
      role: roleEl.value.trim(),
      task: taskEl.value.trim(),
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

// 행 액션: 해당 직원 범위 편집 패널
function attachRowActions(container, { employee, viewRange, onChanged }) {
  const actions = document.createElement("div");
  actions.className = "row-actions px-2 py-1";
  actions.innerHTML = `
    <button class="row-button" data-act="add">업무 배정</button>
    <button class="row-button" data-act="range">기간 편집</button>
  `;
  container.appendChild(actions);

  actions.addEventListener("click", async (e)=>{
    const act = e.target?.dataset?.act;
    if (!act) return;
    if (act === "add") {
      const mid = fmt(viewRange.start);
      openAssignModal({
        emp: employee, dateYmd: mid,
        onSubmit: async (p)=>{
          await addDoc(collection(db, "assignments"), {
            empId: employee.id, ...p
          });
          await onChanged();
        }
      });
    } else if (act === "range") {
      // 해당 직원의 현재 범위 업무 로드 → 간단 목록 제공 후 수정 모달
      // 범위 내 모든 업무를 간단하게 일괄 편집할 수 있는 리스트(삭제/수정)
      const list = document.createElement("div");
      list.className = "fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4";
      list.innerHTML = `
        <div class="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-lg p-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">${employee.name} 업무 목록</h3>
            <button class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" data-close>&times;</button>
          </div>
          <div id="range-list" class="max-h-[60vh] overflow-auto text-sm"></div>
        </div>
      `;
      document.body.appendChild(list);
      list.querySelector("[data-close]").addEventListener("click", ()=> list.remove());

      // 로드
      const col = collection(db, "assignments");
      const snaps = await getDocs(col);
      const s = fmt(viewRange.start);
      const e = fmt(viewRange.end);
      const rows = [];
      snaps.forEach(d=>{
        const a = d.data();
        if (a.empId !== employee.id) return;
        if (a.endDate >= s && a.startDate <= e) {
          rows.push({ id:d.id, ...a });
        }
      });
      rows.sort((a,b)=> (a.startDate||"").localeCompare(b.startDate||""));

      const host = list.querySelector("#range-list");
      host.innerHTML = rows.length ? rows.map(r=> `
        <div class="border-b border-gray-100 dark:border-gray-800 py-2 flex items-center justify-between">
          <div>
            <div class="font-medium">${r.task} <span class="text-xs text-gray-500">(${r.role||"-"})</span></div>
            <div class="text-xs text-gray-500">${r.startDate} ~ ${r.endDate} · 투입 ${Math.round((r.allocation||1)*100)}%</div>
          </div>
          <div class="row-actions">
            <button class="row-button" data-id="${r.id}" data-act="edit">수정</button>
            <button class="row-button" data-id="${r.id}" data-act="del">삭제</button>
          </div>
        </div>
      `).join("") : `<div class="py-4 text-gray-500">해당 기간에 업무 배정이 없습니다.</div>`;

      host.addEventListener("click", async (ev)=>{
        const t = ev.target;
        const id = t?.dataset?.id;
        const act2 = t?.dataset?.act;
        if (!id || !act2) return;
        const item = rows.find(r=> r.id===id);
        if (!item) return;

        if (act2 === "edit") {
          openAssignModal({
            emp: employee,
            dateYmd: item.startDate,
            initial: item,
            onSubmit: async (p)=>{
              await updateDoc(doc(db, "assignments", id), { ...item, ...p });
              await onChanged();
              list.remove();
            },
            onDelete: async ()=>{
              await deleteDoc(doc(db, "assignments", id));
              await onChanged();
              list.remove();
            }
          });
        } else if (act2 === "del") {
          if (!confirm("삭제할까요?")) return;
          await deleteDoc(doc(db, "assignments", id));
          await onChanged();
          list.remove();
        }
      });
    }
  });
}

// 렌더링
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
        </div>
        <div class="flex items-center gap-2">
          <input type="date" id="start-date" class="rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm"/>
          <button id="apply-range" class="text-sm rounded-lg bg-primary text-white px-3 py-1.5">적용</button>
          <button id="add-holiday" class="text-sm rounded-lg border px-3 py-1.5 dark:border-gray-700">휴일추가</button>
        </div>
      </div>
      <div id="calendar-title" class="text-lg font-bold mb-3 text-gray-900 dark:text-white"></div>
      <div id="calendar-wrap" class="horizontal-calendar-scroll"></div>
    </div>
  `;

  document.getElementById("start-date").value = fmt(viewStartDate);
  document.getElementById("prev-month").onclick = () => { viewStartDate = addDays(viewStartDate, -28); document.getElementById("start-date").value = fmt(viewStartDate); draw(); };
  document.getElementById("next-month").onclick = () => { viewStartDate = addDays(viewStartDate, 28); document.getElementById("start-date").value = fmt(viewStartDate); draw(); };
  document.getElementById("today-btn").onclick = () => { viewStartDate = new Date(); document.getElementById("start-date").value = fmt(viewStartDate); draw(); };
  document.getElementById("apply-range").onclick = () => { viewStartDate = parseYmd(document.getElementById("start-date").value); draw(); };

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
      draw();
    } else {
      alert("이미 존재하는 날짜");
    }
  };

  async function draw(){
    const days = await getWeekdaysIncludingHolidays(viewStartDate, VIEW_WORKDAYS);
    const title = `${days[0].date.getFullYear()}년 ${days[0].date.getMonth()+1}월 ~ ${days[days.length-1].date.getFullYear()}년 ${days[days.length-1].date.getMonth()+1}월 (평일 ${days.length}일)`;
    document.getElementById("calendar-title").textContent = title;

    const employees = await loadEmployees();
    const empIds = employees.map(e=>e.id);
    const assignmentsByEmp = await loadAssignmentsInRange(fmt(days[0].date), fmt(days[days.length-1].date), empIds);

    const wrap = document.getElementById("calendar-wrap");
    wrap.innerHTML = "";

    // 헤더
    const headerRow = document.createElement("div");
    headerRow.className = "flex calendar-header-sticky border-b border-gray-200 dark:border-gray-800";

    const memberHead = document.createElement("div");
    memberHead.className = "calendar-left-sticky member-col px-3 py-2 font-bold text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800";
    memberHead.textContent = "팀원";
    headerRow.appendChild(memberHead);

    const roleHead = document.createElement("div");
    roleHead.className = "calendar-left-sticky role-col px-3 py-2 font-bold text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800";
    roleHead.style.left = "240px";
    roleHead.textContent = "역할";
    headerRow.appendChild(roleHead);

    days.forEach(({date, isHoliday})=>{
      const ymd = fmt(date);
      const label = `${date.getMonth()+1}/${date.getDate()}(${DAYNAMES[date.getDay()]})`;
      const el = document.createElement("div");
      el.className = "calendar-cell px-3 py-2 text-center text-sm font-semibold text-gray-700 dark:text-gray-200";
      el.textContent = label;
      if (isHoliday) el.classList.add("holiday-label","holiday-bg");
      headerRow.appendChild(el);
    });
    wrap.appendChild(headerRow);

    // 본문
    const range = { start: days[0].date, end: days[days.length-1].date };

    employees.forEach(emp=>{
      const row = document.createElement("div");
      row.className = "flex border-b border-gray-100 dark:border-gray-800";

      const memberCell = document.createElement("div");
      memberCell.className = "calendar-left-sticky member-col px-3 py-2 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800";
      memberCell.innerHTML = `
        <div class="text-sm font-semibold text-gray-900 dark:text-white flex items-center justify-between gap-2">
          <span>${emp.name || "(이름없음)"} <span class="text-xs text-gray-500">(${emp.team||"미지정"})</span></span>
        </div>
        <div class="text-xs text-gray-500">직급: ${emp.rank||"-"} / 평가: ${emp.evalGrade||"-"}</div>
      `;
      row.appendChild(memberCell);

      const roleCell = document.createElement("div");
      roleCell.className = "calendar-left-sticky role-col px-3 py-2 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800";
      roleCell.style.left = "240px";
      roleCell.innerHTML = `
        <input type="text" data-emp="${emp.id}" placeholder="역할 입력(예: 인프라/보안)" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
      `;
      // 행 액션 버튼(편집)
      attachRowActions(roleCell, {
        employee: emp, viewRange: range,
        onChanged: async ()=> { await draw(); }
      });

      row.appendChild(roleCell);

      const empAssigns = assignmentsByEmp[emp.id] || [];
      days.forEach(({date, isHoliday})=>{
        const ymd = fmt(date);
        const cell = document.createElement("div");
        cell.className = "calendar-cell px-2 py-2 text-sm text-gray-800 dark:text-gray-100 align-top";
        if (isHoliday) cell.classList.add("holiday-bg");

        // 해당일 포함하는 업무 배지
        empAssigns.forEach(a=>{
          if (ymd >= a.startDate && ymd <= a.endDate) {
            const chip = document.createElement("div");
            chip.className = "task-chip";
            chip.title = `${a.task} (${a.role||"-"}) ${a.startDate}~${a.endDate} · ${Math.round((a.allocation||1)*100)}%`;
            chip.textContent = `${a.task}`;
            chip.style.cursor = "pointer";
            chip.addEventListener("click", ()=>{
              // 배지 클릭 → 수정 모달
              openAssignModal({
                emp,
                dateYmd: ymd,
                initial: a,
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
            cell.appendChild(chip);
          }
        });

        // 셀 더블클릭 → 신규 배정
        cell.addEventListener("dblclick", ()=>{
          const roleInput = row.querySelector(`input[data-emp="${emp.id}"]`);
          openAssignModal({
            emp, dateYmd: ymd,
            onSubmit: async (p)=>{
              await addDoc(collection(db, "assignments"), {
                empId: emp.id, role: (p.role || roleInput?.value || ""), task: p.task,
                startDate: p.startDate, endDate: p.endDate, allocation: p.allocation
              });
              await renderCalendarPage(container);
            }
          });
        });

        row.appendChild(cell);
      });

      wrap.appendChild(row);
    });
  }

  await draw();
}
