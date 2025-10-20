// js/app.js
// 간단 해시 라우터 및 페이지 렌더링

import { requireAuthAndTeams } from "./auth.js";
import { renderCalendarPage } from "./calendar.js";
import { renderManMonthPage } from "./mm.js";
import { renderHRPage } from "./hr.js";

const pageTitle = document.getElementById("page-title");
const pageContainer = document.getElementById("page-container");

// 사이드바 라우트 링크 활성화 토글
function markActive(route) {
  document.querySelectorAll(".route-link").forEach(a => {
    if (a.dataset.route === route) {
      a.classList.add("bg-primary/10","text-primary");
      a.classList.remove("text-gray-700","dark:text-gray-300");
    } else {
      a.classList.remove("bg-primary/10","text-primary");
      a.classList.add("text-gray-700","dark:text-gray-300");
    }
  });
}

async function route() {
  const { currentUser } = await requireAuthAndTeams();
  if (!currentUser) return; // auth.js에서 화면 전환

  const hash = (location.hash || "#/calendar").replace("#/", "");
  markActive(hash);

  switch (hash) {
    case "calendar":
      pageTitle.textContent = "인력 투입 달력";
      pageContainer.innerHTML = "";
      await renderCalendarPage(pageContainer);
      break;
    case "manmonth":
      pageTitle.textContent = "Man-Month 계산";
      pageContainer.innerHTML = "";
      await renderManMonthPage(pageContainer);
      break;
    case "hr":
      pageTitle.textContent = "인력 관리";
      pageContainer.innerHTML = "";
      await renderHRPage(pageContainer);
      break;
    default:
      location.hash = "#/calendar";
  }
}

window.addEventListener("hashchange", route);

// 사이드바 클릭 시 라우팅
document.querySelectorAll(".route-link").forEach(a => {
  a.addEventListener("click", () => {
    location.hash = `#/${a.dataset.route}`;
  });
});

// 초기 라우팅은 auth.js의 onAuthStateChanged에서 트리거됨
