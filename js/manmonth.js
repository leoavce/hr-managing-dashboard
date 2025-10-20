// manmonth.js
// 기간 내 평일(휴일 제외) 계산 + 직원별 교집합 일수 합산

function toISO(d){ const t=new Date(d); t.setHours(9,0,0,0); return t.toISOString().slice(0,10); }
function addDays(iso,n){ const d=new Date(iso); d.setDate(d.getDate()+n); return toISO(d); }
function isWeekend(iso){ const dow=new Date(iso).getDay(); return dow===0||dow===6; }

function listWorkdays(startISO, endISO, holidays) {
  const out = [];
  let d = startISO;
  while (d <= endISO) {
    const isHol = !!holidays.find(h => h.date === d);
    if (!isWeekend(d) && !isHol) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export function mountManMonth(state) {
  // 사람 select
  const sel = document.getElementById('mm-employee');
  sel.innerHTML = '<option value="">전체</option>';
  state.employees.forEach(e => {
    const opt = document.createElement('option');
    opt.value = e.id; opt.textContent = e.name;
    sel.appendChild(opt);
  });

  document.getElementById('btn-mm-calc').onclick = () => {
    const s = document.getElementById('mm-start').value;
    const e = document.getElementById('mm-end').value;
    const filter = document.getElementById('mm-employee').value || null;
    if (!s || !e) { alert('기간을 선택하세요'); return; }
    const days = listWorkdays(s, e, state.holidays);
    const byEmp = {};
    for (const a of state.assignments) {
      if (filter && a.employeeId !== filter) continue;
      const n = days.filter(d => d>=a.startDate && d<=a.endDate).length;
      if (n>0) byEmp[a.employeeId] = (byEmp[a.employeeId]||0) + n;
    }
    const total = Object.values(byEmp).reduce((s,v)=>s+v,0);
    const lines = [`<div class="font-semibold mb-2">${s} ~ ${e} 결과</div>`];
    Object.entries(byEmp).forEach(([empId, days]) => {
      const name = (state.employees.find(x=>x.id===empId)||{}).name || empId;
      lines.push(`<div>${name}: ${days} man-day (${(days/20).toFixed(2)} MM)</div>`);
    });
    lines.push(`<hr class="my-2"/>`);
    lines.push(`<div class="font-bold">Total: ${total} man-day (${(total/20).toFixed(2)} MM)</div>`);
    document.getElementById('mm-result').innerHTML = lines.join('');
  };
}