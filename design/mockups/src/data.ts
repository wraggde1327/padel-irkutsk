// Условные заглушки. Не реальные люди, клубы и спонсоры. §12, §16.

export interface Unit {
  id: number;
  name: string;
  wins: number;
  played: number;
  setDiff: number;
  gameDiff: number;
}

export const CLUBS = ['Клуб 1', 'Клуб 2', 'Клуб 3'] as const;
export const PARTNERS = ['Партнёр 1', 'Партнёр 2', 'Партнёр 3'] as const;
export const ENTRY_FEE = 4000;
export const SOLO_FEE = 2000;
export const ORGANIZER_SHARE = 0.3;
export const DIVISION_SHARES = [0.6, 0.3, 0.1];

const SURNAMES = [
  'Андреев', 'Борисов', 'Волков', 'Гусев', 'Дмитриев', 'Егоров', 'Жуков', 'Зайцев', 'Исаев', 'Киселёв',
  'Лебедев', 'Мишин', 'Назаров', 'Орлов', 'Пахомов', 'Рогов', 'Сомов', 'Тимофеев', 'Уваров', 'Фомин',
  'Харитонов', 'Цветков', 'Чернов', 'Шилов', 'Щукин', 'Эрнст', 'Юдин', 'Яковлев', 'Аксёнов', 'Белов',
  'Власов', 'Громов', 'Давыдов', 'Ершов', 'Журавлёв', 'Захаров', 'Ильин', 'Крылов', 'Лазарев', 'Мартынов',
  'Никитин', 'Осипов', 'Прохоров', 'Рябов', 'Сидоров', 'Титов', 'Ушаков', 'Фёдоров', 'Хомяков', 'Цыганов',
  'Чижов', 'Шарапов', 'Щербаков', 'Елисеев', 'Юрин', 'Яшин', 'Баранов', 'Воробьёв', 'Голубев', 'Денисов',
];

function build(): Unit[] {
  const winsPattern = [...Array(8).fill(2), ...Array(14).fill(1), ...Array(8).fill(0)] as number[];
  return winsPattern.map((wins, i) => {
    const seed = (i * 7 + 3) % 11;
    const setDiff = wins === 2 ? 2 + (seed % 3) : wins === 1 ? (seed % 3) - 1 : -2 - (seed % 3);
    const gameDiff = setDiff * 5 + ((seed * 3) % 7) - 3;
    return {
      id: i + 1,
      name: `${SURNAMES[i * 2]} / ${SURNAMES[i * 2 + 1]}`,
      wins,
      played: 2,
      setDiff,
      gameDiff,
    };
  });
}

export const ALL_UNITS = build();

export const RANKED: Unit[] = [...ALL_UNITS].sort(
  (x, y) => y.wins - x.wins || y.setDiff - x.setDiff || y.gameDiff - x.gameDiff || x.id - y.id,
);

export const DIVISIONS: Unit[][] = [RANKED.slice(0, 10), RANKED.slice(10, 20), RANKED.slice(20, 30)];
export const DIVISION_NAMES = ['Дивизион 1', 'Дивизион 2', 'Дивизион 3'] as const;

export const ME: Unit = DIVISIONS[1][7];
export const ME_DIVISION = 1;
export const ME_FIRST = ME.name.split(' / ')[0];

export interface MatchCard {
  id: number;
  stage: string;
  opponent: string;
  deadline: string;
  status: 'to_play' | 'awaiting_me' | 'awaiting_opponent' | 'done';
  score?: string;
  won?: boolean;
  club?: string;
}

export const MATCHES: MatchCard[] = [
  {
    id: 1,
    stage: '1/4 финала, дивизион 2',
    opponent: DIVISIONS[1][0].name,
    deadline: 'до 8 ноября, 23:59',
    status: 'to_play',
  },
  {
    id: 2,
    stage: 'Квалификация, тур 2',
    opponent: ALL_UNITS[20].name,
    deadline: 'сыгран',
    status: 'awaiting_me',
    score: '2:1',
    won: false,
    club: CLUBS[1],
  },
  {
    id: 3,
    stage: 'Плей-ин, дивизион 2',
    opponent: DIVISIONS[1][8].name,
    deadline: 'сыгран',
    status: 'done',
    score: '2:1',
    won: true,
    club: CLUBS[0],
  },
];

export interface BracketSlot {
  unit?: Unit;
  label?: string;
  score?: string;
  winner?: boolean;
}

export interface BracketRound {
  title: string;
  matches: { a: BracketSlot; b: BracketSlot }[];
}

export function makeBracket(div: Unit[], divIndex: number): BracketRound[] {
  const s = (n: number) => div[n - 1];
  const upset = divIndex === 1;
  const w78 = upset ? s(10) : s(7);
  const w89 = s(8);
  return [
    {
      title: 'Плей-ин',
      matches: [
        {
          a: { unit: s(7), score: upset ? '0:2' : '2:0', winner: !upset },
          b: { unit: s(10), score: upset ? '2:0' : '0:2', winner: upset },
        },
        {
          a: { unit: s(8), score: '2:1', winner: true },
          b: { unit: s(9), score: '1:2' },
        },
      ],
    },
    {
      title: '1/4 финала',
      matches: [
        divIndex === 1
          ? { a: { unit: s(1) }, b: { unit: w89 } }
          : { a: { unit: s(1), score: '2:0', winner: true }, b: { unit: w89, score: '0:2' } },
        { a: { unit: s(4) }, b: { unit: s(5) } },
        { a: { unit: s(3) }, b: { unit: s(6) } },
        { a: { unit: s(2) }, b: { unit: w78 } },
      ],
    },
    {
      title: 'Полуфинал',
      matches: [
        { a: { label: 'Победитель 1–8' }, b: { label: 'Победитель 4–5' } },
        { a: { label: 'Победитель 3–6' }, b: { label: 'Победитель 2–7' } },
      ],
    },
    {
      title: 'Финал (офлайн)',
      matches: [{ a: { label: 'Победитель ПФ 1' }, b: { label: 'Победитель ПФ 2' } }],
    },
  ];
}

export function money(n: number): string {
  return `${n.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} ₽`;
}

export function prizeFund(units: number) {
  const gross = units * ENTRY_FEE;
  const organizer = Math.floor(gross * ORGANIZER_SHARE);
  const fund = gross - organizer;
  const perDivision = DIVISION_SHARES.map((share, i, all) => {
    if (i < all.length - 1) return Math.floor(fund * share);
    return fund - all.slice(0, -1).reduce((sum, s) => sum + Math.floor(fund * s), 0);
  });
  return { gross, organizer, fund, perDivision };
}
