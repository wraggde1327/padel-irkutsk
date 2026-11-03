import { useQuery } from '@tanstack/react-query';
import { api, getToken } from '../api';
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
        <section className="card">
          <p className="hint">{ru.matches.empty}</p>
          <p className="hint">{ru.matches.draftHidden}</p>
        </section>
      )}
    </div>
  );
}
