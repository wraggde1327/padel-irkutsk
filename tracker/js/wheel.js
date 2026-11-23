/** Барабан счёта: инерция, snap, бесконечная лента 0…max. */

export const WHEEL_ITEM_PX = 56;
export const WHEEL_VISIBLE = 5;
export const WHEEL_COPIES = 3;
export const TAP_MAX_PX = 10;
export const TAP_MAX_MS = 350;
export const WHEEL_FRICTION = 0.92;
export const WHEEL_STOP_VEL = 0.35;
export const WHEEL_MAX_VEL = 48;

export function isTapGesture(start, end) {
  if (!start || !end) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dt = end.t - start.t;
  const ds = Math.abs((end.offset ?? end.scrollTop ?? 0) - (start.offset ?? start.scrollTop ?? 0));
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

/** Держит смещение в среднем комплекте копий (сдвиг ровно на цикл — картинка та же). */
export function normalizeOffset(offset, len, itemPx = WHEEL_ITEM_PX) {
  const cycle = cyclePx(len, itemPx);
  if (cycle <= 0) return { offset: 0, index: 0 };
  let y = Number(offset) || 0;
  while (y < cycle) y += cycle;
  while (y >= cycle * 2) y -= cycle;
  const index = wrapIndex(Math.round(y / itemPx), len);
  return { offset: y, index };
}

export function snapOffset(offset, len, itemPx = WHEEL_ITEM_PX) {
  if (len <= 0) return { offset: 0, index: 0 };
  const k = Math.round((Number(offset) || 0) / itemPx);
  return { offset: k * itemPx, index: wrapIndex(k, len) };
}

export function stepInertia(vel, friction = WHEEL_FRICTION) {
  return vel * friction;
}

export function indexOfWheelValue(values, value) {
  const key = value == null || value === '' ? '' : String(value);
  const i = values.findIndex((v) => String(v) === key);
  return i < 0 ? 0 : i;
}

function rawFromIndex(values, index) {
  const v = values[wrapIndex(index, values.length)];
  return v === '' || v == null ? '' : String(v);
}

function nearestFromDom(el) {
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

export function nearestWheelValue(el) {
  const values = el._wheelValues;
  if (Array.isArray(values) && values.length) {
    const { index } = snapOffset(el._wheelOffset || 0, values.length);
    const v = values[index];
    return v === '' || v == null ? null : Number(v);
  }
  return nearestFromDom(el);
}

export function applyWheelTransform(el) {
  const track = el.querySelector('[data-wheel-track]');
  const values = el._wheelValues;
  if (!track || !values?.length) return;
  const { offset, index } = normalizeOffset(el._wheelOffset || 0, values.length);
  el._wheelOffset = offset;
  const center = ((WHEEL_VISIBLE - 1) / 2) * WHEEL_ITEM_PX;
  track.style.transform = `translate3d(0, ${center - offset}px, 0)`;
  const key = rawFromIndex(values, index);
  for (const item of el.querySelectorAll('.wheel-item')) {
    const on = (item.dataset.n ?? '') === key;
    item.classList.toggle('is-on', on);
    item.setAttribute('aria-selected', on ? 'true' : 'false');
  }
}

export function scrollWheelTo(el, value, instant = true) {
  if (!el) return;
  const values = el._wheelValues;
  if (!Array.isArray(values) || !values.length) return;
  const index = indexOfWheelValue(values, value);
  const cycle = cyclePx(values.length);
  el._wheelOffset = cycle + index * WHEEL_ITEM_PX;
  el.dataset.syncing = instant ? '1' : '';
  applyWheelTransform(el);
  window.setTimeout(() => {
    el.dataset.syncing = '';
  }, instant ? 40 : 160);
}

export function syncScoreWheels(root) {
  for (const el of root.querySelectorAll('[data-wheel]')) {
    const raw = el.dataset.value;
    scrollWheelTo(el, raw === '' || raw == null ? '' : raw, true);
  }
}

function cancelWheelAnim(el) {
  if (el._wheelRaf) {
    cancelAnimationFrame(el._wheelRaf);
    el._wheelRaf = 0;
  }
}

function animateSnap(el, endOffset, onDone) {
  const start = el._wheelOffset || 0;
  const dist = endOffset - start;
  if (Math.abs(dist) < 0.5) {
    el._wheelOffset = endOffset;
    applyWheelTransform(el);
    onDone();
    return;
  }
  const t0 = performance.now();
  const dur = 140;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const ease = 1 - (1 - p) * (1 - p);
    el._wheelOffset = start + dist * ease;
    applyWheelTransform(el);
    if (p < 1) {
      el._wheelRaf = requestAnimationFrame(step);
      return;
    }
    el._wheelOffset = endOffset;
    applyWheelTransform(el);
    onDone();
  };
  el._wheelRaf = requestAnimationFrame(step);
}

function commitSnapped(el, onCommit) {
  const values = el._wheelValues;
  if (!values?.length) return;
  const snap = snapOffset(el._wheelOffset || 0, values.length);
  animateSnap(el, snap.offset, () => {
    const raw = rawFromIndex(values, snap.index);
    if (raw === (el.dataset.value ?? '')) return;
    el.dataset.value = raw;
    onCommit(raw);
  });
}

function startInertia(el, velPxPerFrame, onCommit) {
  let v = Math.max(-WHEEL_MAX_VEL, Math.min(WHEEL_MAX_VEL, velPxPerFrame));
  if (Math.abs(v) < WHEEL_STOP_VEL) {
    commitSnapped(el, onCommit);
    return;
  }
  const tick = () => {
    v = stepInertia(v);
    el._wheelOffset = (el._wheelOffset || 0) + v;
    applyWheelTransform(el);
    if (Math.abs(v) < WHEEL_STOP_VEL) {
      commitSnapped(el, onCommit);
      return;
    }
    el._wheelRaf = requestAnimationFrame(tick);
  };
  el._wheelRaf = requestAnimationFrame(tick);
}

function tapRowDelta(el, clientY) {
  const rect = el.getBoundingClientRect();
  const y = clientY - rect.top;
  const centerTop = ((WHEEL_VISIBLE - 1) / 2) * WHEEL_ITEM_PX;
  const centerMid = centerTop + WHEEL_ITEM_PX / 2;
  return Math.round((y - centerMid) / WHEEL_ITEM_PX);
}

export function attachLoopingWheel(el, { onCommit, onCenterTap }) {
  const max = Number(el.dataset.max);
  el._wheelValues = wheelValues(Number.isFinite(max) ? max : 0);
  const raw = el.dataset.value;
  scrollWheelTo(el, raw === '' || raw == null ? '' : raw, true);

  let dragging = false;
  let lastY = 0;
  let lastT = 0;
  let vel = 0;
  let start = null;

  const stopDrag = () => {
    dragging = false;
    start = null;
  };

  el.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    cancelWheelAnim(el);
    dragging = true;
    lastY = event.clientY;
    lastT = performance.now();
    vel = 0;
    start = { x: event.clientX, y: event.clientY, t: Date.now(), offset: el._wheelOffset || 0 };
    el.dataset.syncing = '';
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* capture optional */
    }
  });

  el.addEventListener(
    'pointermove',
    (event) => {
      if (!dragging) return;
      event.preventDefault();
      const now = performance.now();
      const dy = lastY - event.clientY;
      const dt = Math.max(1, now - lastT);
      el._wheelOffset = (el._wheelOffset || 0) + dy;
      vel = dy / dt;
      lastY = event.clientY;
      lastT = now;
      applyWheelTransform(el);
    },
    { passive: false },
  );

  el.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = false;
    const end = { x: event.clientX, y: event.clientY, t: Date.now(), offset: el._wheelOffset || 0 };
    const tap = isTapGesture(start, end);
    start = null;
    if (tap) {
      const values = el._wheelValues;
      const { index } = snapOffset(el._wheelOffset || 0, values.length);
      const delta = tapRowDelta(el, event.clientY);
      if (delta === 0) {
        onCenterTap();
        return;
      }
      const next = wrapIndex(index + delta, values.length);
      el._wheelOffset = cyclePx(values.length) + next * WHEEL_ITEM_PX;
      applyWheelTransform(el);
      const nextRaw = rawFromIndex(values, next);
      if (nextRaw !== (el.dataset.value ?? '')) {
        el.dataset.value = nextRaw;
        onCommit(nextRaw);
      }
      return;
    }
    startInertia(el, vel * 16.67, onCommit);
  });

  el.addEventListener('pointercancel', () => {
    if (!dragging) return;
    stopDrag();
    commitSnapped(el, onCommit);
  });

  el.addEventListener('lostpointercapture', () => {
    if (!dragging) return;
    stopDrag();
    commitSnapped(el, onCommit);
  });

  el.addEventListener(
    'touchmove',
    (event) => {
      event.preventDefault();
    },
    { passive: false },
  );
}
