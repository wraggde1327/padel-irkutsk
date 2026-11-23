/** Барабан счёта: нативный scroll-snap (как до 0.7.5) + бесконечная лента. */

export const WHEEL_ITEM_PX = 44;
export const WHEEL_VISIBLE = 3;
export const WHEEL_COPIES = 3;
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

export function wrapIndex(i, len) {
  if (len <= 0) return 0;
  return ((i % len) + len) % len;
}

export function wheelValues(max) {
  const n = Math.max(0, Math.round(Number(max) || 0));
  return [''].concat(Array.from({ length: n + 1 }, (_, i) => i));
}

export function cyclePx(len, itemPx = WHEEL_ITEM_PX) {
  return Math.max(0, len) * itemPx;
}

export function snapOffset(offset, len, itemPx = WHEEL_ITEM_PX) {
  if (len <= 0) return { offset: 0, index: 0 };
  const k = Math.round((Number(offset) || 0) / itemPx);
  return { offset: k * itemPx, index: wrapIndex(k, len) };
}

/** Держит scrollTop в среднем комплекте копий, чтобы лента не упиралась в край. */
export function wrapLoopScrollTop(scrollTop, len, itemPx = WHEEL_ITEM_PX, visible = WHEEL_VISIBLE) {
  const cycle = cyclePx(len, itemPx);
  if (cycle <= 0) return 0;
  const pad = ((visible - 1) / 2) * itemPx;
  let y = Number(scrollTop) || 0;
  while (y < cycle - pad) y += cycle;
  while (y >= cycle * 2 - pad) y -= cycle;
  return y;
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
  const items = [...el.querySelectorAll('.wheel-item')].filter((node) => (node.dataset.n ?? '') === key);
  const item = items[Math.min(1, items.length - 1)] || items[0];
  if (!item) return;
  el.dataset.syncing = '1';
  const top = item.offsetTop - (el.clientHeight - item.offsetHeight) / 2;
  el.scrollTo({ top, behavior: instant ? 'auto' : 'smooth' });
  window.setTimeout(() => {
    el.dataset.syncing = '';
  }, instant ? 80 : 360);
}

export function syncScoreWheels(root) {
  for (const el of root.querySelectorAll('[data-wheel]')) {
    const raw = el.dataset.value;
    scrollWheelTo(el, raw === '' || raw == null ? '' : raw, true);
  }
}

function commitWheel(el, onCommit) {
  if (el.dataset.syncing) return;
  const value = nearestWheelValue(el);
  const raw = value == null ? '' : String(value);
  if (raw === (el.dataset.value ?? '')) return;
  el.dataset.value = raw;
  onCommit(raw);
}

function wrapNativeScroll(el) {
  const values = el._wheelValues;
  if (!values?.length) return;
  const next = wrapLoopScrollTop(el.scrollTop, values.length);
  if (Math.abs(next - el.scrollTop) < 0.5) return;
  el.dataset.syncing = '1';
  el.scrollTop = next;
  el.dataset.syncing = '';
}

export function attachLoopingWheel(el, { onCommit, onCenterTap }) {
  const max = Number(el.dataset.max);
  el._wheelValues = wheelValues(Number.isFinite(max) ? max : 0);
  let start = null;

  el.addEventListener('scroll', () => {
    wrapNativeScroll(el);
    if (el.dataset.syncing) return;
    window.clearTimeout(el._wheelTimer);
    el._wheelTimer = window.setTimeout(() => commitWheel(el, onCommit), 90);
  });
  el.addEventListener('scrollend', () => {
    window.clearTimeout(el._wheelTimer);
    wrapNativeScroll(el);
    if (el.dataset.syncing) {
      el.dataset.syncing = '';
      return;
    }
    commitWheel(el, onCommit);
  });
  el.addEventListener('pointerdown', (event) => {
    if (el.dataset.syncing) return;
    start = { x: event.clientX, y: event.clientY, t: Date.now(), scrollTop: el.scrollTop };
  });
  el.addEventListener('pointerup', (event) => {
    if (!start) return;
    const end = { x: event.clientX, y: event.clientY, t: Date.now(), scrollTop: el.scrollTop };
    const tap = isTapGesture(start, end);
    start = null;
    if (!tap || el.dataset.syncing) return;
    const item = event.target instanceof Element ? event.target.closest('.wheel-item') : null;
    if (!item || !el.contains(item)) {
      const y = event.clientY - el.getBoundingClientRect().top;
      const mid = el.clientHeight / 2;
      if (Math.abs(y - mid) <= WHEEL_ITEM_PX / 2) onCenterTap();
      return;
    }
    event.preventDefault();
    const tapped = item.dataset.n ?? '';
    const selected = nearestWheelValue(el);
    const selectedKey = selected == null ? '' : String(selected);
    if (tapped === selectedKey) {
      onCenterTap();
      return;
    }
    el.dataset.value = tapped;
    el.dataset.syncing = '1';
    onCommit(tapped);
  });
  el.addEventListener('pointercancel', () => {
    start = null;
  });
}
