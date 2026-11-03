import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api';
import { IconMatches } from '../icons';
import { ru } from '../i18n/ru';

export function MatchesScreen() {
  const { data } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api<{ matches: unknown[] }>('/api/v1/matches/me'),
    enabled: Boolean(getToken()),
  });
  const matches = data?.matches ?? [];
  return (
    <div className="page">
      <div className="title">{ru.matches.title}</div>
      {matches.length === 0 && (
        <section className="card empty">
          <IconMatches />
          <p className="hint">{ru.matches.empty}</p>
          <p className="hint">{ru.matches.draftHidden}</p>
          <Link to="/" className="btn secondary">
            {ru.matches.toHome}
          </Link>
        </section>
      )}
    </div>
  );
}
