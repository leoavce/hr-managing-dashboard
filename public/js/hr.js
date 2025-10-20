// hr.js
// 인력/프리셋/배치 관리 UI

import {
  listEmployees, createEmployee, updateEmployee, deleteEmployee,
  getPresets, upsertPresets,
  listHolidays, createHoliday, deleteHoliday,
  listAssignments, createAssignment, deleteAssignment
} from "./api.js";

function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; }
function clear(n){ while(n.firstChild) n.removeChild(n.firstChild); }

export async function mountHR(state) {
  await renderEmpTable(state);
  await renderPresetsPanel(state);
  await renderAssignSection(state);

  // 등록 이벤트
  document.getElementById('btn-emp-add').onclick = async () => {
    const emp = {
      name: document.getElementById('emp-name').value.trim(),
      team: document.getElementById('emp-team').value.trim(),
      rank: document.getElementById('emp-rank').value.trim(),
      eval: document.getElementById('emp-eval').value.trim(),
      joined: document.getElementById('emp-joined').value || null,
      left: document.getElementById('emp-left').value || null
    };
    if (!emp.name) return alert('이름은 필수입니다.');
    await createEmployee(emp);
    await state.reload();
    await renderEmpTable(state);
  };
  document.getElementById('btn-emp-refresh').onclick = async () => {
    await state.reload();
    await renderEmpTable(state);
  };

  document.getElementById('btn-add-role').onclick = async () => {
    const val = document.getElementById('preset-role').value.trim();
    if (!val) return;
    const p = await getPresets();
    const roles = Array.from(new Set([...(p.roles||[]), val]));
    await upsertPresets({ roles });
    document.getElementById('preset-role').value='';
    await state.reload();
    await renderPresetsPanel(state);
  };
  document.getElementById('btn-add-task').onclick = async () => {
    const val = document.getElementById('preset-task').value.trim();
    if (!val) return;
    const p = await getPresets();
    const tasks = Array.from(new Set([...(p.tasks||[]), val]));
    await upsertPresets({ tasks });
    document.getElementById('preset-task').value='';
    await state.reload();
    await renderPresetsPanel(state);
  };
  document.getElementById('btn-add-holiday').onclick = async () => {
    const date = document.getElementById('preset-holiday-date').value;
    const name = document.getElementById('preset-holiday-name').value.trim();
    if (!date || !name) return alert('휴일 날짜/이름을 입력하세요.');
    await createHoliday({ date, name });
    document.getElementById('preset-holiday-date').value='';
    document.getElementById('preset-holiday-name').value='';
    await state.reload();
    await renderPresetsPanel(state);
  };

  document.getElementById('btn-as-add').onclick = async () => {
    const empId = document.getElementById('as-emp').value;
    const role = document.getElementById('as-role').value;
    const task = document.getElementById('as-task').value;
    const startDate = document.getElementById('as-start').value;
    const endDate = document.getElementById('as-end').value;
    if (!empId || !role || !task || !startDate || !endDate) return alert('모든 항목을 입력하세요.');
    await createAssignment({ employeeId: empId, role, task, startDate, endDate });
    await state.reload();
    await renderAssignTable(state);
  };
  document.getElementById('btn-as-refresh').onclick = async () => {
    await state.reload();
    await renderAssignTable(state);
  };
}

async function renderEmpTable(state) {
  const wrap = document.getElementById('emp-table');
  clear(wrap);
  const tbl = el(`<table class="min-w-full border text-left">
    <thead><tr class="bg-gray-50">
      <th class="px-2 py-1">이름</th><th class="px-2 py-1">팀</th><th class="px-2 py-1">직급</th>
      <th class="px-2 py-1">평가</th><th class="px-2 py-1">입사</th><th class="px-2 py-1">퇴사</th><th class="px-2 py-1">액션</th>
    </tr></thead><tbody></tbody></table>`);
  const tb = tbl.querySelector('tbody');
  state.employees.forEach(e => {
    const tr = el(`<tr class="border-t">
      <td class="px-2 py-1">${e.name}</td>
      <td class="px-2 py-1">${e.team || ''}</td>
      <td class="px-2 py-1">${e.rank || ''}</td>
      <td class="px-2 py-1">${e.eval || ''}</td>
      <td class="px-2 py-1">${e.joined || ''}</td>
      <td class="px-2 py-1">${e.left || ''}</td>
      <td class="px-2 py-1">
        <button class="btn-mini" data-edit="${e.id}">수정</button>
        <button class="btn-mini" data-del="${e.id}">삭제</button>
      </td>
    </tr>`);

    tr.querySelector('[data-del]').onclick = async () => {
      if (!confirm('삭제하시겠습니까?')) return;
      await deleteEmployee(e.id);
      await state.reload();
      await renderEmpTable(state);
    };
    tr.querySelector('[data-edit]').onclick = async () => {
      const name = prompt('이름', e.name) ?? e.name;
      const team = prompt('팀', e.team || '') ?? e.team;
      const rank = prompt('직급', e.rank || '') ?? e.rank;
      const ev = prompt('평가(A~E)', e.eval || '') ?? e.eval;
      const joined = prompt('입사(YYYY-MM-DD)', e.joined || '') ?? e.joined;
      const left = prompt('퇴사(YYYY-MM-DD)', e.left || '') ?? e.left;
      await updateEmployee({ id:e.id, name, team, rank, eval:ev, joined, left });
      await state.reload();
      await renderEmpTable(state);
    };

    tb.appendChild(tr);
  });
  wrap.appendChild(tbl);
}

async function renderPresetsPanel(state) {
  const roles = document.getElementById('list-roles');
  const tasks = document.getElementById('list-tasks');
  const hols  = document.getElementById('list-holidays');
  roles.innerHTML = ''; tasks.innerHTML = ''; hols.innerHTML = '';

  (state.presets.roles || []).forEach((v, idx) => {
    const li = el(`<li class="flex items-center justify-between"><span>${v}</span><button class="btn-mini">X</button></li>`);
    li.querySelector('button').onclick = async () => {
      const p = await getPresets();
      p.roles.splice(idx, 1);
      await upsertPresets({ roles: p.roles });
      await state.reload();
      await renderPresetsPanel(state);
    };
    roles.appendChild(li);
  });

  (state.presets.tasks || []).forEach((v, idx) => {
    const li = el(`<li class="flex items-center justify-between"><span>${v}</span><button class="btn-mini">X</button></li>`);
    li.querySelector('button').onclick = async () => {
      const p = await getPresets();
      p.tasks.splice(idx, 1);
      await upsertPresets({ tasks: p.tasks });
      await state.reload();
      await renderPresetsPanel(state);
    };
    tasks.appendChild(li);
  });

  // 휴일: holidays 컬렉션(서버 데이터) 표시
  state.holidays.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(h => {
    const li = el(`<li class="flex items-center justify-between">
      <span>${h.date} ${h.name}</span>
      <button class="btn-mini">X</button>
    </li>`);
    li.querySelector('button').onclick = async () => {
      await deleteHoliday(h.id);
      await state.reload();
      await renderPresetsPanel(state);
    };
    hols.appendChild(li);
  });
}

async function renderAssignSection(state) {
  // 셀렉터
  const se = document.getElementById('as-emp');
  const sr = document.getElementById('as-role');
  const st = document.getElementById('as-task');
  se.innerHTML=''; sr.innerHTML=''; st.innerHTML='';
  state.employees.forEach(e => se.appendChild(el(`<option value="${e.id}">${e.name}</option>`)));
  (state.presets.roles||[]).forEach(v => sr.appendChild(el(`<option>${v}</option>`)));
  (state.presets.tasks||[]).forEach(v => st.appendChild(el(`<option>${v}</option>`)));
  // 테이블
  await renderAssignTable(state);
}

export async function renderAssignTable(state) {
  const wrap = document.getElementById('as-table');
  wrap.innerHTML = '';
  const tbl = el(`<table class="min-w-full border text-left">
    <thead><tr class="bg-gray-50">
      <th class="px-2 py-1">이름</th><th class="px-2 py-1">역할</th><th class="px-2 py-1">업무</th>
      <th class="px-2 py-1">시작</th><th class="px-2 py-1">종료</th><th class="px-2 py-1">액션</th>
    </tr></thead><tbody></tbody></table>`);
  const tb = tbl.querySelector('tbody');
  state.assignments.forEach(a => {
    const emp = state.employees.find(e => e.id===a.employeeId);
    const tr = el(`<tr class="border-t">
      <td class="px-2 py-1">${emp ? emp.name : a.employeeId}</td>
      <td class="px-2 py-1">${a.role || ''}</td>
      <td class="px-2 py-1">${a.task || ''}</td>
      <td class="px-2 py-1">${a.startDate}</td>
      <td class="px-2 py-1">${a.endDate}</td>
      <td class="px-2 py-1"><button class="btn-mini">삭제</button></td>
    </tr>`);
    tr.querySelector('button').onclick = async () => {
      if (!confirm('삭제하시겠습니까?')) return;
      await deleteAssignment(a.id);
      await state.reload();
      await renderAssignTable(state);
    };
    tb.appendChild(tr);
  });
  wrap.appendChild(tbl);
}