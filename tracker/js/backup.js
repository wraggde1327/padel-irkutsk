/** Экспорт и импорт турниров файлом. Без бэкенда, без тихой перезаписи. */

export const BACKUP_APP = 'padel-mini-tracker';

export function irkutskYmd(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Irkutsk',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function exportFileName(label, now = new Date()) {
  const slug =
    String(label || 'turniry')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}-]+/gu, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'turniry';
  return `padel-${slug}-${irkutskYmd(now)}.json`;
}

export function buildExportPayload(tournaments, now = new Date()) {
  return {
    app: BACKUP_APP,
    version: 2,
    exportedAt: now.toISOString(),
    tournaments: Array.isArray(tournaments) ? tournaments : [],
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Проверка файла. Возвращает список сырых турниров (ещё без новых id).
 * Принимает наш v2-экспорт, один турнир или старое v1-сохранение.
 */
export function parseImportJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл не JSON.');
  }
  if (!isPlainObject(data) && !Array.isArray(data)) {
    throw new Error('Неверный файл турнира.');
  }
  if (isPlainObject(data) && data.app && data.app !== BACKUP_APP) {
    throw new Error('Это не файл этого трекера.');
  }
  let list = [];
  if (Array.isArray(data)) list = data;
  else if (Array.isArray(data.tournaments)) list = data.tournaments;
  else if (isPlainObject(data.tournament)) list = [data.tournament];
  else if (isPlainObject(data) && (Array.isArray(data.players) || isPlainObject(data.settings))) {
    list = [data];
  }
  if (!list.length) throw new Error('В файле нет турниров.');
  const tournaments = list.filter(isPlainObject);
  if (!tournaments.length) throw new Error('В файле нет турниров.');
  for (const item of tournaments) {
    if (item.players != null && !Array.isArray(item.players)) {
      throw new Error('В файле повреждён список игроков.');
    }
    if (item.rounds != null && !Array.isArray(item.rounds)) {
      throw new Error('В файле повреждены круги.');
    }
    if (item.settings != null && !isPlainObject(item.settings)) {
      throw new Error('В файле повреждены настройки.');
    }
  }
  return tournaments;
}

function isIos() {
  const ua = globalThis.navigator?.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (globalThis.navigator?.platform === 'MacIntel' && globalThis.navigator?.maxTouchPoints > 1);
}

/**
 * Скачивание JSON. На iOS Safari blob+download часто игнорируется — data URL надёжнее.
 */
export function downloadJson(filename, data) {
  const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  if (isIos()) {
    const reader = new FileReader();
    reader.onloadend = () => {
      a.href = String(reader.result || '');
      a.click();
      a.remove();
    };
    reader.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}
