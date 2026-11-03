import { useMemo, useState } from 'react';
import {
  CLUBS,
  DIVISIONS,
  DIVISION_NAMES,
  ENTRY_FEE,
  INITIAL_MATCHES,
  ME,
  ME_DIVISION,
  makeBracket,
  money,
  prizeFund,
  type Match,
  type Unit,
} from './data';

type Tab = 'home' | 'matches' | 'table' | 'bracket' | 'profile';
type Screen = Tab | 'register';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Главная', icon: '◉' },
  { id: 'matches', label: 'Матчи', icon: '🎾' },
  { id: 'table', label: 'Таблица', icon: '☰' },
  { id: 'bracket', label: 'Сетка', icon: '⌥' },
  { id: 'profile', label: 'Профиль', icon: '☺' },
];

export default function App() {
  const [screen, setScreen] = useState<Screen>(
    () => (['home', 'matches', 'table', 'bracket', 'profile', 'register'].includes(location.hash.slice(1)) ? (location.hash.slice(1) as Screen) : 'home'),
  );
  const [registered, setRegistered] = useState(false);
  const [matches, setMatches] = useState<Match[]>(INITIAL_MATCHES);

  const nav = (s: Screen) => {
    setScreen(s);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="app">
      <main className="content">
        {screen === 'home' && (
          <Home registered={registered} matches={matches} go={nav} />
        )}
        {screen === 'register' && (
          <Register
            onDone={() => {
              setRegistered(true);
              nav('home');
            }}
            onBack={() => nav('home')}
          />
        )}
        {screen === 'matches' && <Matches matches={matches} setMatches={setMatches} />}
        {screen === 'table' && <Table />}
        {screen === 'bracket' && <Bracket />}
        {screen === 'profile' && <Profile registered={registered} />}
      </main>
      <nav className="tabbar" aria-label="Разделы">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={'tab' + (screen === t.id ? ' active' : '')}
            onClick={() => nav(t.id)}
          >
            <span className="tab-icon" aria-hidden>
              {t.icon}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <div className="demo-badge">демо · тестовые данные</div>
    </div>
  );
}

/* ---------- Главная ---------- */
function Home({
  registered,
  matches,
  go,
}: {
  registered: boolean;
  matches: Match[];
  go: (s: Screen) => void;
}) {
  const pf = prizeFund(30);
  const next = matches.find((m) => m.status === 'to_play' || m.status === 'awaiting_me');
  return (
    <>
      <h1 className="title">Падел-турнир, Иркутск</h1>
      <div className="stage-chip">Плей-офф · 1/4 финала · осталось 5 дней</div>

      {registered ? (
        next && (
          <button className="card card-accent card-btn" onClick={() => go('matches')}>
            <div className="label">Следующее действие</div>
            <div className="big">
              {next.status === 'awaiting_me' ? 'Подтвердить результат' : `Матч: ${next.opponent}`}
            </div>
            <div className="hint">{next.stage} · {next.deadline}</div>
          </button>
        )
      ) : (
        <button className="btn primary" onClick={() => go('register')}>
          Участвовать в 1 тап · {money(ENTRY_FEE)} с пары
        </button>
      )}

      <section className="card">
        <div className="label">Призовой фонд (расчёт для 30 пар)</div>
        <div className="big">{money(pf.fund)}</div>
        <div className="prize-row">
          {pf.perDivision.map((v, i) => (
            <div key={i} className="prize">
              <span className="hint">Див. {i + 1}</span>
              <b>{money(v)}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="label">Площадки</div>
        <div className="chips">
          {CLUBS.map((c) => (
            <span key={c} className="chip">{c}</span>
          ))}
        </div>
        <div className="hint">Играйте на любой из трёх в течение недели.</div>
      </section>

      <section className="card">
        <div className="label">Партнёры турнира</div>
        <div className="sponsors">
          {['Партнёр 1', 'Партнёр 2', 'Партнёр 3'].map((s) => (
            <div key={s} className="sponsor">{s}</div>
          ))}
        </div>
      </section>
    </>
  );
}

/* ---------- Регистрация ---------- */
function Register({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [mode, setMode] = useState<'pair' | 'solo'>('pair');
  const [rating, setRating] = useState(3.0);
  const [paid, setPaid] = useState(false);
  const fee = mode === 'pair' ? ENTRY_FEE : ENTRY_FEE / 2;

  return (
    <>
      <button className="back" onClick={onBack}>← Назад</button>
      <h1 className="title">Регистрация</h1>
      <div className="seg">
        <button className={mode === 'pair' ? 'on' : ''} onClick={() => setMode('pair')}>
          Парой
        </button>
        <button className={mode === 'solo' ? 'on' : ''} onClick={() => setMode('solo')}>
          Один
        </button>
      </div>
      <p className="hint pad">
        {mode === 'pair'
          ? 'Пара фиксируется на весь турнир. Напарник примет приглашение по ссылке.'
          : 'На каждый матч вам подберут случайного напарника из одиночек.'}
      </p>

      <section className="card">
        <div className="label">Ваш рейтинг Lunda</div>
        <div className="stepper">
          <button aria-label="Меньше" onClick={() => setRating((r) => Math.max(1, +(r - 0.1).toFixed(1)))}>−</button>
          <div className="big">{rating.toFixed(1)}</div>
          <button aria-label="Больше" onClick={() => setRating((r) => Math.min(7, +(r + 0.1).toFixed(1)))}>＋</button>
        </div>
        <div className="hint">Шкала 1,0–7,0. Админ проверит по скриншоту.</div>
      </section>

      {mode === 'pair' && (
        <button className="btn secondary">Пригласить напарника (ссылка)</button>
      )}

      <div className="spacer" />
      <button
        className="btn primary sticky"
        onClick={() => {
          if (!paid) setPaid(true);
          else onDone();
        }}
      >
        {paid ? 'Оплачено ✓ — готово' : `Оплатить ${money(fee)} (СБП)`}
      </button>
    </>
  );
}

/* ---------- Мои матчи ---------- */
function Matches({
  matches,
  setMatches,
}: {
  matches: Match[];
  setMatches: (m: Match[]) => void;
}) {
  const [sheet, setSheet] = useState<Match | null>(null);
  const [score, setScore] = useState('2:0');
  const [club, setClub] = useState(CLUBS[0]);

  const update = (id: number, patch: Partial<Match>) =>
    setMatches(matches.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  return (
    <>
      <h1 className="title">Мои матчи</h1>
      {matches.map((m) => (
        <section className="card" key={m.id}>
          <div className="label">{m.stage}</div>
          <div className="big">{ME.name} — {m.opponent}</div>
          {m.status === 'to_play' && (
            <>
              <div className="hint">Срок: {m.deadline}. Не сыграете — техническое поражение.</div>
              <div className="row">
                <button className="btn secondary">Написать сопернику</button>
                <button
                  className="btn primary"
                  onClick={() => {
                    setSheet(m);
                    setScore('2:0');
                  }}
                >
                  Внести результат
                </button>
              </div>
            </>
          )}
          {m.status === 'awaiting_me' && (
            <>
              <div className="hint">Соперник внёс: {m.score} в их пользу · {m.club}</div>
              <div className="row">
                <button className="btn secondary" onClick={() => update(m.id, { status: 'done' })}>
                  Спор
                </button>
                <button
                  className="btn primary"
                  onClick={() => update(m.id, { status: 'done', won: false })}
                >
                  Подтвердить
                </button>
              </div>
            </>
          )}
          {m.status === 'awaiting_opponent' && (
            <div className="status warn">Ждём подтверждения соперника · {m.score} · {m.club}</div>
          )}
          {m.status === 'done' && (
            <div className={'status ' + (m.won ? 'ok' : 'bad')}>
              {m.won ? 'Победа' : 'Поражение'} · {m.score} · {m.club}
            </div>
          )}
        </section>
      ))}

      {sheet && (
        <div className="overlay" onClick={() => setSheet(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="big">Результат матча</div>
            <div className="label">Счёт по сетам (у вас : у соперника)</div>
            <div className="seg">
              {['2:0', '2:1', '1:2', '0:2'].map((s) => (
                <button key={s} className={score === s ? 'on' : ''} onClick={() => setScore(s)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="label">Где играли</div>
            <div className="seg">
              {CLUBS.map((c) => (
                <button key={c} className={club === c ? 'on' : ''} onClick={() => setClub(c)}>
                  {c}
                </button>
              ))}
            </div>
            <button
              className="btn primary"
              onClick={() => {
                update(sheet.id, {
                  status: 'awaiting_opponent',
                  score,
                  club,
                  won: score === '2:0' || score === '2:1',
                });
                setSheet(null);
              }}
            >
              Отправить
            </button>
            <button className="btn link" onClick={() => setSheet(null)}>Отмена</button>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Таблица ---------- */
function Table() {
  const [d, setD] = useState(ME_DIVISION);
  return (
    <>
      <h1 className="title">Таблица</h1>
      <div className="seg">
        {DIVISION_NAMES.map((n, i) => (
          <button key={n} className={d === i ? 'on' : ''} onClick={() => setD(i)}>
            Див. {i + 1}
          </button>
        ))}
      </div>
      <section className="card flush">
        <div className="trow thead">
          <span>#</span>
          <span>Пара</span>
          <span>И</span>
          <span>В</span>
          <span>Δ</span>
        </div>
        {DIVISIONS[d].map((u, i) => (
          <TableRow key={u.id} u={u} pos={i + 1} me={u.id === ME.id} />
        ))}
      </section>
      <p className="hint pad">Сортировка: победы → личная встреча → разница сетов → разница геймов.</p>
    </>
  );
}

function TableRow({ u, pos, me }: { u: Unit; pos: number; me: boolean }) {
  return (
    <div className={'trow' + (me ? ' me' : '') + (pos <= 8 ? '' : ' out')}>
      <span>{pos}</span>
      <span className="name">{u.name}</span>
      <span>{u.played}</span>
      <span>{u.wins}</span>
      <span>{u.setDiff > 0 ? '+' : ''}{u.setDiff}</span>
    </div>
  );
}

/* ---------- Сетка ---------- */
function Bracket() {
  const [d, setD] = useState(ME_DIVISION);
  const rounds = useMemo(() => makeBracket(DIVISIONS[d], d), [d]);
  return (
    <>
      <h1 className="title">Сетка</h1>
      <div className="seg">
        {DIVISION_NAMES.map((n, i) => (
          <button key={n} className={d === i ? 'on' : ''} onClick={() => setD(i)}>
            Див. {i + 1}
          </button>
        ))}
      </div>
      <div className="bracket-scroll">
        <div className="bracket">
          {rounds.map((r) => (
            <div className="round" key={r.title}>
              <div className="label">{r.title}</div>
              <div className="round-col">
                {r.matches.map((m, i) => (
                  <div className="bmatch" key={i}>
                    {[m.a, m.b].map((s, j) => (
                      <div
                        key={j}
                        className={
                          'slot' +
                          (s.winner ? ' win' : '') +
                          (s.unit && s.unit.id === ME.id ? ' me' : '')
                        }
                      >
                        <span className="name">
                          {s.unit ? s.unit.name : s.label}
                        </span>
                        {s.score && <b>{s.score}</b>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="hint pad">Пары 1–6 проходят в 1/4 финала без игры. Призовые места: 1-е и 2-е в каждом дивизионе.</p>
    </>
  );
}

/* ---------- Профиль ---------- */
function Profile({ registered }: { registered: boolean }) {
  return (
    <>
      <h1 className="title">Профиль</h1>
      <section className="card profile">
        <div className="avatar">{ME.name[0]}</div>
        <div>
          <div className="big">{ME.name.split(' / ')[0]}</div>
          <div className="hint">{registered ? 'Участник, дивизион 2' : 'Дивизион 2 (демо)'}</div>
        </div>
      </section>
      <section className="card">
        <div className="stats">
          <div><b>3</b><span className="hint">матча</span></div>
          <div><b>2</b><span className="hint">победы</span></div>
          <div><b>2</b><span className="hint">клуба</span></div>
        </div>
      </section>
      <section className="card">
        <div className="label">Рейтинг</div>
        <div className="kv"><span>Рейтинг турнира</span><b>1 042</b></div>
        <div className="kv"><span>Lunda (указан вами)</span><b>3,4</b></div>
        <div className="status warn">Ждёт проверки админом по скриншоту</div>
        <button className="btn secondary">Загрузить скриншот Lunda</button>
      </section>
    </>
  );
}
