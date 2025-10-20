/**
 * 공통 UI 헬퍼
 * - 라우팅(#calendar | #manmonth | #hr)
 * - 사이드바 네비 연결
 * - CSV 업로더 생성(helper)
 * - 저장템플릿 셀렉터
 */

export const Routes = {
  CALENDAR: '#calendar',
  MANMONTH: '#manmonth',
  HR: '#hr'
};

export function setActiveRoute(hash) {
  window.location.hash = hash;
}

export function mountSidebarNavigation(onNavigate) {
  // index.html의 사이드바 <nav> 내 링크 2개를 잡아 라우팅 연결
  const nav = document.querySelector('aside nav');
  if (!nav) return;

  const links = Array.from(nav.querySelectorAll('a'));
  // 첫 번째: Man-month, 두 번째: HR
  if (links[0]) links[0].addEventListener('click', (e) => {
    e.preventDefault();
    onNavigate(Routes.MANMONTH);
  });
  if (links[1]) links[1].addEventListener('click', (e) => {
    e.preventDefault();
    onNavigate(Routes.HR);
  });

  // 메인 타이틀 클릭 시 캘린더로(선택)
  const header = document.querySelector('main .flex .text-4xl');
  if (header) header.addEventListener('click', () => onNavigate(Routes.CALENDAR));
}

export function renderInMain(element) {
  const mainCard = document.querySelector('main .bg-white, main .dark\\:bg-gray-900');
  const container = mainCard?.parentElement ?? document.querySelector('main');
  if (!container) return;
  // 기존 내용을 치우고 교체(초간단 라우팅)
  container.innerHTML = '';
  container.appendChild(element);
}

export function makeCSVInput(labelText, onFileLoaded) {
  const wrap = document.createElement('div');
  wrap.className = 'mt-4 flex items-center gap-3';

  const label = document.createElement('label');
  label.className = 'text-sm text-gray-700';
  label.textContent = labelText;

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.className = 'block text-sm';

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      onFileLoaded(text);
    };
    reader.readAsText(file, 'utf-8');
  });

  wrap.appendChild(label);
  wrap.appendChild(input);
  return wrap;
}

export function makeTemplatesSelector(title, items, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'flex items-center gap-2';
  const label = document.createElement('span');
  label.className = 'text-sm text-gray-700';
  label.textContent = title;
  const select = document.createElement('select');
  select.className = 'border rounded px-2 py-1 text-sm';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = '선택';
  select.appendChild(opt0);
  items.forEach((it) => {
    const o = document.createElement('option');
    o.value = it.value;
    o.textContent = it.label;
    select.appendChild(o);
  });
  select.addEventListener('change', () => onPick(select.value));
  wrap.appendChild(label);
  wrap.appendChild(select);
  return wrap;
