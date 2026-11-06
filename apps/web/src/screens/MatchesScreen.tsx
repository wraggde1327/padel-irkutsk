import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { PageHeader } from '../PageHeader';
import { api, getToken, rememberedTournament } from '../api';
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
  mine?: boolean;
  played?: boolean;
  canSubmit?: boolean;
};

export function MatchesScreen() {
  const { id } = useParams<{ id: string }>();
  const tournamentId = id || rememberedTournament();
  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  const loggedIn = Boolean(getToken());
  const q = tournamentId ? `?tournamentId=${tournamentId}` : '';

  const mineQuery = useQuery({
    queryKey: ['matches-me', tournamentId],
    queryFn: () => api<{ open: MatchDto[]; played: MatchDto[] }>(`/api/v1/matches/me${q}`),
    enabled: loggedIn,
  });
  const allQuery = useQuery({
    queryKey: ['matches', tournamentId],
    queryFn: () => api<{ matches: MatchDto[] }>(`/api/v1/matches${q}`),
  });

  const open = mineQuery.data?.open ?? [];
  const played = mineQuery.data?.played ?? [];
  const all = allQuery.data?.matches ?? [];
  const base = tournamentId ? `/t/${tournamentId}` : '';

  return (
    <div className="page">
      <PageHeader title={ru.matches.title} backTo={tournamentId ? `/t/${tournamentId}` : '/'} />
      <div className="seg">
        <button type="button" className={'seg-btn' + (tab === 'mine' ? ' is-on' : '')} onClick={() => setTab('mine')}>
          {ru.matches.mine}
        </button>
        <button type="button" className={'seg-btn' + (tab === 'all' ? ' is-on' : '')} onClick={() => setTab('all')}>
          {ru.matches.all}
        </button>
      </div>
      <p className="hint">{ru.matches.colorHint}</p>

      {tab === 'mine' && !loggedIn && (
        <section className="card empty">
          <p className="hint">{ru.register.needLogin}</p>
          <Link to="/profile" className="btn primary">
            {ru.auth.title}
          </Link>
        </section>
      )}

      {tab === 'mine' && loggedIn && (
        <>
          <div className="label">{ru.matches.open}</div>
          {open.length === 0 && <p className="hint">{ru.matches.openEmpty}</p>}
          {open.map((match) => (
            <MatchCard key={match.id} match={match} href={`${base}/matches/${match.id}`} />
          ))}
          <div className="label">{ru.matches.played}</div>
          {played.length === 0 && <p className="hint">{ru.matches.playedEmpty}</p>}
          {played.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </>
      )}

      {tab === 'all' && (
        <>
          {all.length === 0 && (
            <section className="card empty">
              <IconMatches />
              <p className="hint">{ru.matches.empty}</p>
            </section>
          )}
          {all.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              href={match.canSubmit ? `${base}/matches/${match.id}` : undefined}
            />
          ))}
        </>
      )}
    </div>
  );
}

function namesOf(side: { label: string; names?: string[] } | null): string[] {
  if (!side) return [ru.matches.bye];
  if (side.names && side.names.length > 0) return side.names;
  return side.label.split(/\s*[+/]\s*/).filter(Boolean);
}

export function MatchCard({ match, href }: { match: MatchDto; href?: string }) {
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
  const played = match.played ?? (Boolean(match.winner) || match.status === 'CONFIRMED' || match.status === 'BYE');
  const className =
    'card match-card' +
    (played ? ' is-played' : ' is-open') +
    (match.canSubmit ? ' is-clickable' : '') +
    (match.winner === 'A' ? ' win-a' : match.winner === 'B' ? ' win-b' : '');

  const body = (
    <>
      <div className="hint">
        {match.title}
        {match.division ? ` · ${match.division}` : ''}
        {match.canSubmit ? ` · ${ru.matches.tapToScore}` : ''}
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
          ) : sets.length > 0 ? (
            sets.map((set, i) => (
              <div key={i}>
                {set.gamesA}–{set.gamesB}
              </div>
            ))
          ) : (
            <div className="hint">0–0</div>
          )}
        </div>
        <div className={'match-names is-b' + (match.winner === 'B' ? ' is-win' : '')}>
          {right.map((name) => (
            <div key={name}>{name}</div>
          ))}
        </div>
      </div>
    </>
  );

  if (href) {
    return (
      <Link to={href} className={className}>
        {body}
      </Link>
    );
  }
  return <section className={className}>{body}</section>;
}
