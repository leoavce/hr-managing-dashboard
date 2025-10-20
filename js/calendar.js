// js/calendar.js
// 가로형 평일 달력 렌더러 + 투입/역할/업무 관리

import { db } from "./firebase.js";
import { requireAuthAndTeams } from "./auth.js";
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

// ---- 유틸: 날짜 처리 ----
function fmt(d){ return d.toISOString().slice(0,10); }
function parseYmd(s){ const [y,m,dd]=s.split("-").map(Number); return new Date(y, m-1, dd); }
function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function isWeekend(d){ const day=d.getDay(); return day===0 || day===6; } // 일(0), 토(6)

// 화면 상단 월 이동 상태
let viewStartDate = new Date(); // 기본: 오늘 기준 주간부터
// 보기 기간(일). 가로 스크롤 최적화 위해 22영업일(약 한달) 기본
const VIEW_BUSINESS_DAYS = 22;

// 한국 공휴일 기본(샘플: 2024~2026 일부). 필요시 Firestore holidays 병합.
const STATIC_HOLIDAYS = {
  2024: [
    "2024-01-01","2024-02-09","2024-02-12","2024-03-01","2024-04-10",
    "2024-05-05","2024-05-06","2024-06-06","2024-08-15","2024-09-16","2024-09-17","2024-09-18",
    "2024-10-03","2024-10-09","2024-12-25"
  ],
  2025: [
    "2025-01-01","2025-01-28","2025-01-29","2025-01-30","2025-03-01",
    "2025-05-05","2025-06-06","2025-08-15","2025-10-03","2025-10-06","2025-10-09","2025-12-25"
  ],
  2026: [
    "2026-01-01","2026-02-16","2026-02-17","2026-03-01","2026-05-05",
    "2026-05-25","2026-06-06","2026-08-15","2026-09-24","2026-10-03","2026-10-09","2026-12-25"
  ]
};

// Firestore holidays 병합
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

async function getBusinessDaysRange(startDate, nBusiness) {
  const days = [];
  let d = new Date(startDate);
  // 앞쪽으로 이동해 주말이 아닌 최근 영업일의 시작으로 보정
  while(isWeekend(d)) d = addDays(d, 1);

  // 필요 연도의 휴일 로드(대부분 1~2개년이면 충분)
  const years = new Set();
  const probeEnd = addDays(d, nBusiness * 2); // 여유
  for (let y=d.getFullYear(); y<=probeEnd.getFullYear(); y++) years.add(y);
  const holidayMap = {};
  for (const y of years) holidayMap[y] = new Set(await loadYearHolidays(y));

  while (days.length < nBusiness) {
    const y = d.getFullYear();
    const ymd = fmt(d);
    const isHol = holidayMap[y]?.has(ymd) || false;
    if (!isWeekend(d) && !isHol) days.push(new Date(d));
    d = addDays(d, 1);
  }
  return days;
}

// ---- 데이터 접근: 직원/배정 ----
async function loadEmployees(teams, canSeeAll){
  const col = collection(db, "employees");
  let q;
  if (canSeeAll) {
    q = query(col, where("status","in", ["active", "onleave"])); // 표시 대상
  } else {
    // 팀 필터
    q = query(col, where("team","in", teams.length ? teams : ["__none__"]));
  }
  const out = [];
  const snaps = await getDocs(q);
  snaps.forEach(docu => out.push({ id: docu.id, ...docu.data() }));
  // 정렬: 팀→이름
  out.sort((a,b)=> (a.team||"").localeCompare(b.team||"") || (a.name||"").localeCompare(b.name||""));
  return out;
}

async function loadAssignmentsInRange(startYmd, endYmd, empIds) {
  const col = collection(db, "assignments");
  // 간단 구현: 전량 로드 후 필터 (규모 커지면 날짜 인덱스 구조로 개선 권장)
  const snaps = await getDocs(col);
  const s = parseYmd(startYmd);
  const e = parseYmd(endYmd);
  const byEmp = {};
  snaps.forEach(d=>{
    const a = d.data();
    if (!empIds.includes(a.empId)) return;
    const as = parseYmd(a.startDate);
    const ae = parseYmd(a.endDate);
    // 기간 겹침 체크
    if (ae >= s && as <= e) {
      if (!byEmp[a.empId]) byEmp[a.empId] = [];
      byEmp[a.empId].push({ id: d.id, ...a });
    }
  });
  return byEmp;
}

// ---- 렌더링 ----
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
          <button id="add-assignment" class="text-sm rounded-lg bg-blue-50 text-blue-700 px-3 py-1.5 border border-blue-200">업무 배정</button>
          <button id="favorites-btn" class="text-sm rounded-lg border px-3 py-1.5 dark:border-gray-700">즐겨찾기</button>
        </div>
      </div>
      <div id="calendar-title" class="text-lg font-bold mb-3 text-gray-900 dark:text-white"></div>
      <div id="calendar-wrap" class="horizontal-calendar-scroll"></div>
    </div>
  `;

  const { currentTeams, canSeeAll } = await requireAuthAndTeams();

  // 초기 날짜 세팅
  const sd = document.getElementById("start-date");
  sd.value = fmt(viewStartDate);

  document.getElementById("prev-month").onclick = () => {
    viewStartDate = addDays(viewStartDate, -28); // 4주 전
    sd.value = fmt(viewStartDate);
    draw();
  };
  document.getElementById("next-month").onclick = () => {
    viewStartDate = addDays(viewStartDate, 28);
    sd.value = fmt(viewStartDate);
    draw();
  };
  document.getElementById("today-btn").onclick = () => {
    viewStartDate = new Date();
    sd.value = fmt(viewStartDate);
    draw();
  };
  document.getElementById("apply-range").onclick = () => {
    viewStartDate = parseYmd(sd.value);
    draw();
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
      draw();
    } else {
      alert("이미 존재하는 날짜");
    }
  };

  document.getElementById("add-assignment").onclick = async ()=>{
    // 간단 입력 다이얼로그 (실운영은 모달/검증 권장)
    const empId = prompt("배정할 직원 ID(employees 문서 ID):");
    const role = prompt("역할(예: 인프라/보안 등):");
    const task = prompt("업무 내용:");
    const startDate = prompt("시작일(YYYY-MM-DD):", fmt(viewStartDate));
    const endDate = prompt("종료일(YYYY-MM-DD):", fmt(addDays(viewStartDate, 7)));
    const allocation = parseFloat(prompt("투입 비율(0~1, 예: 0.5):", "1")) || 1;
    if (!empId || !role || !task || !startDate || !endDate) return;

    await addDoc(collection(db, "assignments"), {
      empId, role, task, startDate, endDate, allocation
    });
    alert("업무 배정 등록 완료");
    draw();
  };

  document.getElementById("favorites-btn").onclick = ()=>{
    alert("즐겨찾기: 인력관리/달력에서 입력 시 '자주 쓰는 역할/업무'는 각 입력 모달에 별도 체크로 저장되며, 다음 입력 시 자동 제안됩니다. (간단화 구현)");
  };

  async function draw(){
    const days = await getBusinessDaysRange(viewStartDate, VIEW_BUSINESS_DAYS);
    const title = `${days[0].getFullYear()}년 ${days[0].getMonth()+1}월 ~ ${days[days.length-1].getFullYear()}년 ${days[days.length-1].getMonth()+1}월 (영업일 ${days.length}일)`;
    document.getElementById("calendar-title").textContent = title;

    const employees = await loadEmployees(currentTeams, canSeeAll);
    const empIds = employees.map(e=>e.id);
    const assignmentsByEmp = await loadAssignmentsInRange(fmt(days[0]), fmt(days[days.length-1]), empIds);

    // 상단 날짜 헤더 + 좌측 직원/역할 + 우측 일자 셀
    const wrap = document.getElementById("calendar-wrap");
    wrap.innerHTML = "";

    // 헤더 행
    const headerRow = document.createElement("div");
    headerRow.className = "flex calendar-header-sticky border-b border-gray-200 dark:border-gray-800";

    // 좌측 고정 영역: 타이틀 셀 2개(팀원, 역할)
    const memberHead = document.createElement("div");
    memberHead.className = "calendar-left-sticky member-col px-3 py-2 font-bold text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800";
    memberHead.textContent = "팀원";
    headerRow.appendChild(memberHead);

    const roleHead = document.createElement("div");
    roleHead.className = "calendar-left-sticky role-col px-3 py-2 font-bold text-sm text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800";
    roleHead.style.left = "220px"; // member-col width
    roleHead.textContent = "역할";
    headerRow.appendChild(roleHead);

    // 날짜 헤더
    days.forEach(d=>{
      const ymd = fmt(d);
      const dayNames = ["일","월","화","수","목","금","토"];
      const label = `${d.getMonth()+1}/${d.getDate()}(${dayNames[d.getDay()]})`;
      const el = document.createElement("div");
      el.className = "calendar-cell px-3 py-2 text-center text-sm font-semibold text-gray-700 dark:text-gray-200";
      el.textContent = label;
      // 휴일 라벨 적용
      const y = d.getFullYear();
      const isHol = (STATIC_HOLIDAYS[y]||[]).includes(ymd);
      if (isHol) el.classList.add("holiday-label");
      headerRow.appendChild(el);
    });

    wrap.appendChild(headerRow);

    // 본문 행: 직원별
    employees.forEach(emp=>{
      const row = document.createElement("div");
      row.className = "flex border-b border-gray-100 dark:border-gray-800";

      const memberCell = document.createElement("div");
      memberCell.className = "calendar-left-sticky member-col px-3 py-2 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800";
      memberCell.innerHTML = `
        <div class="text-sm font-semibold text-gray-900 dark:text-white">${emp.name || "(이름없음)"} <span class="text-xs text-gray-500">(${emp.team||"미지정"})</span></div>
        <div class="text-xs text-gray-500">직급: ${emp.rank||"-"} / 평가: ${emp.evalGrade||"-"}</div>
      `;
      row.appendChild(memberCell);

      const roleCell = document.createElement("div");
      roleCell.className = "calendar-left-sticky role-col px-3 py-2 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800";
      roleCell.style.left = "220px";
      roleCell.innerHTML = `
        <input type="text" data-emp="${emp.id}" placeholder="역할 입력(예: 인프라/보안)" class="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm" />
      `;
      row.appendChild(roleCell);

      // 업무/배정 셀: 해당 일에 걸친 배정 보여주기 (chip)
      const empAssigns = assignmentsByEmp[emp.id] || [];

      days.forEach(day=>{
        const ymd = fmt(day);
        const cell = document.createElement("div");
        cell.className = "calendar-cell px-2 py-2 text-sm text-gray-800 dark:text-gray-100 align-top";

        // day에 걸친 배정 chip 렌더
        empAssigns.forEach(a=>{
          if (ymd >= a.startDate && ymd <= a.endDate) {
            const chip = document.createElement("div");
            chip.className = "task-chip";
            chip.title = `${a.task} (${a.role}) ${a.startDate}~${a.endDate} / 투입:${Math.round((a.allocation||1)*100)}%`;
            chip.textContent = `${a.task}`;
            cell.appendChild(chip);
          }
        });

        // 셀 클릭으로 업무 빠른 입력
        cell.addEventListener("dblclick", async ()=>{
          const task = prompt(`[${emp.name}] ${ymd} 업무 내용:`);
          if (!task) return;
          const roleInput = row.querySelector(`input[data-emp="${emp.id}"]`);
          const role = roleInput?.value?.trim() || "";
          await addDoc(collection(db, "assignments"), {
            empId: emp.id,
            role,
            task,
            startDate: ymd,
            endDate: ymd,
            allocation: 1
          });
          cell.appendChild(Object.assign(document.createElement("div"), {
            className: "task-chip",
            textContent: task
          }));
        });

        row.appendChild(cell);
      });

      wrap.appendChild(row);
    });
  }

  await draw();
}
