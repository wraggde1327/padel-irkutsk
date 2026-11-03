import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { IconTable } from '../icons';
import { ru } from '../i18n/ru';

export function TableScreen() {
  const { data } = useQuery({
    queryKey: ['standings'],
    queryFn: () => api<{ rows: unknown[] }>('/api/v1/standings'),
  });
  return (
    <div className="page">
      <div className="title">{ru.table.title}</div>
      {(data?.rows.length ?? 0) === 0 && (
        <section className="card empty">
          <IconTable />
          <p className="hint">{ru.table.empty}</p>
          <Link to="/" className="btn secondary">
            {ru.matches.toHome}
          </Link>
        </section>
      )}
      <p className="hint">{ru.table.sort}</p>
    </div>
  );
}
