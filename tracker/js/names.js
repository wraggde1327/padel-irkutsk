/** Пул из 50 русских имён для кнопки «+4»: 25 М и 25 Ж. */

import { shuffle } from './rng.js';

export const DEMO_PLAYERS = [
  { name: 'Александр', gender: 'M' },
  { name: 'Дмитрий', gender: 'M' },
  { name: 'Иван', gender: 'M' },
  { name: 'Сергей', gender: 'M' },
  { name: 'Андрей', gender: 'M' },
  { name: 'Алексей', gender: 'M' },
  { name: 'Николай', gender: 'M' },
  { name: 'Максим', gender: 'M' },
  { name: 'Павел', gender: 'M' },
  { name: 'Михаил', gender: 'M' },
  { name: 'Артём', gender: 'M' },
  { name: 'Владимир', gender: 'M' },
  { name: 'Евгений', gender: 'M' },
  { name: 'Игорь', gender: 'M' },
  { name: 'Роман', gender: 'M' },
  { name: 'Антон', gender: 'M' },
  { name: 'Кирилл', gender: 'M' },
  { name: 'Олег', gender: 'M' },
  { name: 'Виктор', gender: 'M' },
  { name: 'Юрий', gender: 'M' },
  { name: 'Борис', gender: 'M' },
  { name: 'Глеб', gender: 'M' },
  { name: 'Егор', gender: 'M' },
  { name: 'Лев', gender: 'M' },
  { name: 'Никита', gender: 'M' },
  { name: 'Анна', gender: 'F' },
  { name: 'Мария', gender: 'F' },
  { name: 'Елена', gender: 'F' },
  { name: 'Ольга', gender: 'F' },
  { name: 'Наталья', gender: 'F' },
  { name: 'Екатерина', gender: 'F' },
  { name: 'Татьяна', gender: 'F' },
  { name: 'Ирина', gender: 'F' },
  { name: 'Светлана', gender: 'F' },
  { name: 'Юлия', gender: 'F' },
  { name: 'Анастасия', gender: 'F' },
  { name: 'Дарья', gender: 'F' },
  { name: 'Виктория', gender: 'F' },
  { name: 'Полина', gender: 'F' },
  { name: 'Алина', gender: 'F' },
  { name: 'Ксения', gender: 'F' },
  { name: 'Валерия', gender: 'F' },
  { name: 'София', gender: 'F' },
  { name: 'Вера', gender: 'F' },
  { name: 'Надежда', gender: 'F' },
  { name: 'Людмила', gender: 'F' },
  { name: 'Галина', gender: 'F' },
  { name: 'Оксана', gender: 'F' },
  { name: 'Марина', gender: 'F' },
  { name: 'Кира', gender: 'F' },
];

function nameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

/** До `limit` случайных имён из пула, которых ещё нет в турнире. */
export function pickDemoPlayers(existing, { limit = 4, rng = Math.random } = {}) {
  const take = Math.max(0, Number(limit) || 0);
  if (!take) return [];
  const taken = new Set((existing || []).map((p) => nameKey(p.name)));
  const available = DEMO_PLAYERS.filter((p) => !taken.has(nameKey(p.name)));
  return shuffle(available, rng).slice(0, take);
}
