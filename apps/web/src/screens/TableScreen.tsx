import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { IconTable } from '../icons';
import { ru } from '../i18n/ru';

type Row = {
  rank: number | null;
  label: string;
  type: string;
  played: number;
  wins: number;
  losses: number;
  byes: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
};

export function TableScreen() {
  const { data } = useQuery({
    queryKey: ['standings'],
    queryFn: () => api<{ rows: Row[] }>('/api/v1/standings'),
  });
  const rows = data?.rows ?? [];
  return (
    <div className="page">
      <div className="title">{ru.table.title}</div>
      {rows.length === 0 && (
        <section className="card empty">
          <IconTable />
          <p className="hint">{ru.table.empty}</p>
          <Link to="/" className="btn secondary">
            {ru.matches.toHome}
          </Link>
        </section>
      )}
      {rows.map((row) => (
        <section className="card table-row" key={row.label + String(row.rank)}>
          <b className="rank">{row.rank ?? '—'}</b>
          <div>
            <div className="big">{row.label}</div>
            <div className="hint">
              {row.type === 'SOLO' ? 'одиночка' : 'пара'} · {row.played} игр
            </div>
          </div>
          <div className="table-stats">
            <span>
              {ru.table.w} {row.wins}
            </span>
            <span>
              {ru.table.l} {row.losses}
            </span>
            <span>
              {row.setsWon}:{row.setsLost}
            </span>
          </div>
        </section>
      ))}
      <p className="hint">{ru.table.sort}</p>
    </div>
  );
}
