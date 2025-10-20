/**
 * 한국 공휴일 관리
 * - Firestore 에서 팀별 커스텀 휴일 우선 사용: /teams/{teamId}/holidays/{yyyy-mm-dd}
 * - 없으면 2025 기본 셋(예시) fallback
 * - 주말(토/일)은 달력에서 제외하므로, 휴일 셋은 평일/대체공휴일 중심으로 쓰임
 */
import { db } from './firebase-init.js';
import {
  collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/** fallback: 2025년(예시) - 필요시 CSV 업로드로 덮어쓰기 */
const FALLBACK_2025 = {
  "2025-01-01": "신정",
  "2025-01-27": "설연휴",
  "2025-01-28": "설날",
  "2025-01-29": "설연휴",
  "2025-03-01": "삼일절",
  "2025-05-05": "어린이날(대체)",
  "2025-05-06": "어린이날 대체공휴일",
  "2025-06-06": "현충일",
  "2025-08-15": "광복절",
  "2025-10-03": "개천절",
  "2025-10-06": "추석",
  "2025-10-07": "추석",
  "2025-10-08": "추석",
  "2025-10-09": "한글날",
  "2025-12-25": "성탄절"
};

/** yyyy-mm-dd 포맷 */
function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 팀별 휴일 set 로드 */
export async function loadHolidayMap(teamId, year) {
  const holidays = {};
  try {
    const col = collection(db, 'teams', teamId, 'holidays');
    const snaps = await getDocs(col);
    snaps.forEach((doc) => {
      const data = doc.data();
      // doc.id = yyyy-mm-dd, { name: '설날' }
      holidays[doc.id] = data?.name ?? '휴일';
    });
  } catch (_) {
    // ignore
  }

  // fallback merge (요청 년도와 일치하는 fallback만)
  if (year === 2025) {
    for (const [k, v] of Object.entries(FALLBACK_2025)) {
      if (!holidays[k]) holidays[k] = v;
    }
  }
  return holidays;
}

/** 주말 제외 평일 배열 생성 */
export function generateWeekdays(startDate, days) {
  const arr = [];
  const d = new Date(startDate.getTime());
  while (arr.length < days) {
    const dow = d.getDay(); // 0=일, 6=토
    if (dow !== 0 && dow !== 6) {
      arr.push(new Date(d.getTime()));
    }
    d.setDate(d.getDate() + 1);
  }
  return arr;
}

export function toKoreanDayShort(d) {
  const w = ['일','월','화','수','목','금','토'];
  return w[d.getDay()];
}

export { fmt }
