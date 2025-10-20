// js/app.js
import { renderCalendarPage } from "./calendar.js";
import { renderHRPage } from "./hr.js";
import { renderMMPage } from "./mm.js";
import "./auth.js"; // 로그인/세션 제어

const pageTitle = document.getElementById("page-title");
const pageContainer = document.getElementById("page-container");
const navLinks = document.querySelectorAll(".nav-link");

function setActive(hash) {
  navLinks.forEach(a=>{
    if (a.getAttribute("href") === hash) {
      a.classList.add("bg-primary/10","text-primary");
      a.classList.remove("text-gray-600","dark:text-gray-300");
    } else {
      a.classList.remove("bg-primary/10","text-primary");
      a.classList.add("text-gray-600","dark:text-gray-300");
    }
  });
}

async function route() {
  const hash = location.hash || "#calendar";
  setActive(hash);
  if (hash === "#hr") {
    pageTitle.textContent = "인력 관리";
    await renderHRPage(pageContainer);
  } else if (hash === "#mm") {
    pageTitle.textContent = "Man-Month 계산";
    await renderMMPage(pageContainer);
  } else {
    pageTitle.textContent = "투입 달력";
    await renderCalendarPage(pageContainer);
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("load", route);
