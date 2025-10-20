// csv.js
// CSV 파서(의존성 없음) + Firestore 일괄 업로드

import { bulkReplace } from "./api.js";

function safeTrim(s){ return (s||'').toString().trim(); }

// 따옴표/이중따옴표/콤마 최소 처리
export function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const rows = [];
  for (const line of lines) {
    if (line === '') { continue; }
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i=0;i<line.length;i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i+1] === '"') { cur += '"'; i++; }
          else { inQ = false; }
        } else cur += ch;
      } else {
        if (ch === ',') { out.push(cur); cur=''; }
        else if (ch === '"') { inQ = true; }
        else cur += ch;
      }
    }
    out.push(cur);
    rows.push(out);
  }
  return rows;
}

// target: employees | assignments | holidays
export async function importCsv(target, csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw new Error('no rows');
  const header = rows[0].map(safeTrim);
  const items = [];
  for (let i=1;i<rows.length;i++) {
    const r = rows[i]; if (!r || r.length===0) continue;
    const obj = {};
    header.forEach((h,idx)=> obj[h] = safeTrim(r[idx]||''));
    items.push(obj);
  }
  // Firestore 교체 배치
  return await bulkReplace(target, items);
}