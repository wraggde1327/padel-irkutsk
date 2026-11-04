import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../PageHeader';
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
      <PageHeader title={ru.table.title} />
      {rows.length === 0 && (
        <section className="card empty">
          <IconTable />
          <p className="hint">{ru.table.empty}</p>
        </section>
      )}
      {rows.length > 0 && (
        <div className="table-legend">
          <span className="rank" />
          <span className="table-who" />
          <div className="table-stats head">
            <span>{ru.table.w}</span>
            <span>{ru.table.d}</span>
            <span>{ru.table.l}</span>
          </div>
        </div>
      )}
      {rows.map((row) => (
        <section className="card table-row" key={row.label + String(row.rank)}>
          <b className="rank">{row.rank ?? '—'}</b>
          <div className="table-who">
            <div className="big">{row.label}</div>
            <div className="hint">{row.type === 'SOLO' ? 'одиночка' : 'пара'}</div>
          </div>
          <div className="table-stats">
            <span>{row.wins}</span>
            <span>0</span>
            <span>{row.losses}</span>
          </div>
        </section>
      ))}
      <p className="hint">{ru.table.sort}</p>
    </div>
  );
}
