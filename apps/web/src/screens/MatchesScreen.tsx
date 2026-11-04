import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../PageHeader';
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
  sets: Array<{ gamesA: number; gamesB: number }>;
  sideA: { id: string; label: string; names?: string[] };
  sideB: { id: string; label: string; names?: string[] } | null;
};

export function MatchesScreen() {
  const { data } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api<{ matches: MatchDto[] }>('/api/v1/matches'),
  });
  const matches = data?.matches ?? [];
  return (
    <div className="page">
      <PageHeader title={ru.matches.title} />
      {matches.length === 0 && (
        <section className="card empty">
          <IconMatches />
          <p className="hint">{ru.matches.empty}</p>
          <p className="hint">{ru.matches.draftHidden}</p>
        </section>
      )}
      {matches.map((match) => (
        <MatchCard key={match.id} match={match} />
      ))}
    </div>
  );
}

function namesOf(side: { label: string; names?: string[] } | null): string[] {
  if (!side) return [ru.matches.bye];
  if (side.names && side.names.length > 0) return side.names;
  return side.label.split(/\s*[+/]\s*/).filter(Boolean);
}

export function MatchCard({ match }: { match: MatchDto }) {
  const left = namesOf(match.sideA);
  const right = namesOf(match.sideB);
  const sets = match.sets?.length
    ? match.sets
    : match.score
      ? match.score.split(/\s+/).map((part) => {
          const [a, b] = part.split(/[-:]/).map(Number);
          return { gamesA: a || 0, gamesB: b || 0 };
        })
      : [];
  return (
    <section className={'card match-card' + (match.winner === 'A' ? ' win-a' : match.winner === 'B' ? ' win-b' : '')}>
      <div className="hint">
        {match.title}
        {match.division ? ` · ${match.division}` : ''}
      </div>
      <div className="match-grid">
        <div className={'match-names is-a' + (match.winner === 'A' ? ' is-win' : '')}>
          {left.map((name) => (
            <div key={name}>{name}</div>
          ))}
        </div>
        <div className="match-sets">
          {match.isBye ? (
            <div>{ru.matches.bye}</div>
          ) : (
            sets.map((set, i) => (
              <div key={i}>
                {set.gamesA}–{set.gamesB}
              </div>
            ))
          )}
        </div>
        <div className={'match-names is-b' + (match.winner === 'B' ? ' is-win' : '')}>
          {right.map((name) => (
            <div key={name}>{name}</div>
          ))}
        </div>
      </div>
    </section>
  );
}
