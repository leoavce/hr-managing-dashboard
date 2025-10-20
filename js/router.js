// router.js
// 해시 기반 라우터 (#/calendar | #/manmonth | #/hr)

export const ROUTES = ['#/calendar', '#/manmonth', '#/hr'];

export function activateRoute(hash) {
  if (!ROUTES.includes(hash)) hash = '#/calendar';
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.navlink').forEach(a => a.classList.remove('bg-primary/10','text-primary','active'));
  const link = document.querySelector(`a[data-route="${hash}"]`);
  if (link) link.classList.add('bg-primary/10','text-primary','active');

  document.getElementById('page-title').textContent =
    (hash === '#/calendar') ? 'Man-Month Calendar' :
    (hash === '#/manmonth') ? 'Calculating Man-Month' : 'HR';

  const viewId = (hash === '#/calendar') ? 'view-calendar' :
                 (hash === '#/manmonth') ? 'view-manmonth' : 'view-hr';
  document.getElementById(viewId).classList.remove('hidden');
}

export function mountRouter(onChange) {
  window.addEventListener('hashchange', () => onChange(location.hash));
  if (!location.hash) location.hash = '#/calendar';
  onChange(location.hash);
}