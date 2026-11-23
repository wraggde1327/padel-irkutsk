/** Барабан счёта: scroll-snap, без зависимостей. */

export const WHEEL_ITEM_PX = 44;
export const TAP_MAX_PX = 10;
export const TAP_MAX_MS = 350;

export function isTapGesture(start, end) {
  if (!start || !end) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dt = end.t - start.t;
  const ds = Math.abs((end.scrollTop ?? 0) - (start.scrollTop ?? 0));
  return dt <= TAP_MAX_MS && dx * dx + dy * dy <= TAP_MAX_PX * TAP_MAX_PX && ds <= 4;
}

export function nearestWheelValue(el) {
  const mid = el.scrollTop + el.clientHeight / 2;
  let best = '';
  let bestDist = Infinity;
  for (const item of el.querySelectorAll('.wheel-item')) {
    const center = item.offsetTop + item.offsetHeight / 2;
    const dist = Math.abs(center - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = item.dataset.n ?? '';
    }
  }
  return best === '' ? null : Number(best);
}

export function scrollWheelTo(el, value, instant = true) {
  if (!el) return;
  const key = value == null || value === '' ? '' : String(value);
  const item = [...el.querySelectorAll('.wheel-item')].find((node) => (node.dataset.n ?? '') === key);
  if (!item) return;
  el.dataset.syncing = '1';
  const top = item.offsetTop - (el.clientHeight - item.offsetHeight) / 2;
  el.scrollTo({ top, behavior: instant ? 'auto' : 'smooth' });
  window.setTimeout(() => {
    el.dataset.syncing = '';
  }, instant ? 320 : 480);
}

export function syncScoreWheels(root) {
  for (const el of root.querySelectorAll('[data-wheel]')) {
    const raw = el.dataset.value;
    const value = raw === '' || raw == null ? '' : raw;
    scrollWheelTo(el, value, true);
  }
}
