// api.js
// Firestore CRUD 래퍼: employees / assignments / presets / holidays

import { db } from "./firebase-init.js";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  writeBatch, serverTimestamp, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// === 공통 유틸 ===
function safeDateStr(s) { return (s || "").toString().trim(); }
function withCreatedAt(data) { return { ...data, createdAt: serverTimestamp() }; }

// === Employees ===
export async function listEmployees() {
  const snap = await getDocs(collection(db, "employees"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function createEmployee(emp) {
  if (emp.id) {
    await setDoc(doc(db, "employees", emp.id), withCreatedAt(emp));
    return emp;
  } else {
    const ref = await addDoc(collection(db, "employees"), withCreatedAt(emp));
    return { id: ref.id, ...emp };
  }
}
export async function updateEmployee(emp) {
  if (!emp.id) throw new Error("id required");
  await updateDoc(doc(db, "employees", emp.id), emp);
  return emp;
}
export async function deleteEmployee(id) {
  await deleteDoc(doc(db, "employees", id));
  return { ok: true };
}

// === Assignments ===
export async function listAssignments() {
  const snap = await getDocs(collection(db, "assignments"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function createAssignment(as) {
  if (as.id) {
    await setDoc(doc(db, "assignments", as.id), withCreatedAt(as));
    return as;
  } else {
    const ref = await addDoc(collection(db, "assignments"), withCreatedAt(as));
    return { id: ref.id, ...as };
  }
}
export async function deleteAssignment(id) {
  await deleteDoc(doc(db, "assignments", id));
  return { ok: true };
}

// === Presets (단일 문서: default) ===
export async function getPresets() {
  const ref = doc(db, "presets", "default");
  const s = await getDoc(ref);
  if (s.exists()) return { id: "default", ...s.data() };
  const init = { roles: ["인프라","보안","백엔드","프론트엔드","데이터"], tasks: ["운영 이관","보안 점검","신규 개발","유지보수","분석"], members: [] };
  await setDoc(ref, init);
  return { id: "default", ...init };
}
export async function upsertPresets(p) {
  const ref = doc(db, "presets", "default");
  await setDoc(ref, p, { merge: true });
  return { ok: true };
}

// === Holidays ===
export async function listHolidays() {
  const snap = await getDocs(collection(db, "holidays"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function createHoliday(h) {
  if (h.id) {
    await setDoc(doc(db, "holidays", h.id), withCreatedAt(h));
    return h;
  } else {
    const ref = await addDoc(collection(db, "holidays"), withCreatedAt(h));
    return { id: ref.id, ...h };
  }
}
export async function deleteHoliday(id) {
  await deleteDoc(doc(db, "holidays", id));
  return { ok: true };
}

// === CSV 일괄 업로드 ===
// items: 배열, target: "employees"|"assignments"|"holidays"
export async function bulkReplace(target, items) {
  const col = collection(db, target);
  // 기존 삭제 후 새로 작성 (작업 단순화를 위해 "교체" 동작)
  // 문서 수가 매우 많다면 페이징 삭제 권장. 여기선 500 이하 가정.
  const old = await getDocs(col);
  const batch = writeBatch(db);
  old.forEach(d => batch.delete(d.ref));
  for (const it of items) {
    if (it.id) batch.set(doc(db, target, it.id), withCreatedAt(it));
    else {
      // id 없으면 랜덤 문서 생성
      const ref = doc(col);
      batch.set(ref, withCreatedAt(it));
    }
  }
  await batch.commit();
  return { ok: true, count: items.length };
}