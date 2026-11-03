import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { IconMatches } from '../icons';
import { ru } from '../i18n/ru';

export type MatchDto = {
  id: string;
  title: string;
  stage: string;
  division: string | null;
  isBye: boolean;
  status: string;
  score: string;
  winner: 'A' | 'B' | null;
  sideA: { id: string; label: string };
  sideB: { id: string; label: string } | null;
};

export function MatchesScreen() {
  const { data } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api<{ matches: MatchDto[] }>('/api/v1/matches'),
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
      {matches.map((match) => (
        <MatchCard key={match.id} match={match} />
      ))}
    </div>
  );
}

export function MatchCard({ match }: { match: MatchDto }) {
  return (
    <section className="card match-card">
      <div className="hint">
        {match.title}
        {match.division ? ` · ${match.division}` : ''}
      </div>
      {match.isBye ? (
        <>
          <div className="match-side is-win">{match.sideA.label}</div>
          <div className="match-score">{ru.matches.bye}</div>
        </>
      ) : (
        <>
          <div className={'match-side' + (match.winner === 'A' ? ' is-win' : '')}>{match.sideA.label}</div>
          <div className="match-score">{match.score || '—'}</div>
          <div className={'match-side' + (match.winner === 'B' ? ' is-win' : '')}>{match.sideB?.label ?? ru.matches.bye}</div>
        </>
      )}
    </section>
  );
}
