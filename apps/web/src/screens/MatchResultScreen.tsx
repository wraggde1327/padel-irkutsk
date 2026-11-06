import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { ru } from '../i18n/ru';
import type { MatchDto } from './MatchesScreen';

type SetScore = { gamesA: number; gamesB: number };

export function MatchResultScreen() {
  const { id: tournamentId, matchId } = useParams<{ id: string; matchId: string }>();
  const navigate = useNavigate();
  const query = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => api<{ match: MatchDto }>(`/api/v1/matches/${matchId}`),
    enabled: Boolean(matchId),
  });
  const match = data?.match;
  const [sets, setSets] = useState<SetScore[]>([{ gamesA: 0, gamesB: 0 }, { gamesA: 0, gamesB: 0 }]);
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () =>
      api<{ match: MatchDto }>(`/api/v1/matches/${matchId}/result`, {
        method: 'POST',
        body: JSON.stringify({ sets }),
      }),
    onSuccess: async () => {
      await query.invalidateQueries({ queryKey: ['matches'] });
      await query.invalidateQueries({ queryKey: ['matches-me'] });
      await query.invalidateQueries({ queryKey: ['standings'] });
      navigate(tournamentId ? `/t/${tournamentId}/matches` : '/matches');
    },
    onError: (err) => setError((err as Error).message),
  });

  const left = useMemo(() => match?.sideA.names ?? match?.sideA.label.split(/\s*[+/]\s*/) ?? [], [match]);
  const right = useMemo(
    () => match?.sideB?.names ?? match?.sideB?.label.split(/\s*[+/]\s*/) ?? [ru.matches.bye],
    [match],
  );

  if (isLoading) return <div className="page-msg">{ru.home.loading}</div>;
  if (isError || !match) {
    return (
      <div className="page">
        <p className="hint">{ru.errors.network}</p>
        <Link to={tournamentId ? `/t/${tournamentId}/matches` : '/matches'} className="btn secondary">
          {ru.register.back}
        </Link>
      </div>
    );
  }

  if (!match.canSubmit) {
    return (
      <div className="page">
        <Link to={tournamentId ? `/t/${tournamentId}/matches` : '/matches'} className="back">
          ← {ru.register.back}
        </Link>
        <div className="title">{ru.matches.resultTitle}</div>
        <p className="hint">{match.played ? ru.matches.alreadyPlayed : ru.matches.notYours}</p>
      </div>
    );
  }

  const bump = (index: number, side: 'A' | 'B', delta: number) => {
    setSets((prev) =>
      prev.map((set, i) => {
        if (i !== index) return set;
        if (side === 'A') return { ...set, gamesA: Math.max(0, Math.min(20, set.gamesA + delta)) };
        return { ...set, gamesB: Math.max(0, Math.min(20, set.gamesB + delta)) };
      }),
    );
  };

  return (
    <div className="page result-page">
      <Link to={tournamentId ? `/t/${tournamentId}/matches` : '/matches'} className="back">
        ← {ru.register.back}
      </Link>
      <div className="title">{ru.matches.resultTitle}</div>
      <p className="hint">
        {match.title}
        {match.division ? ` · ${match.division}` : ''}
      </p>

      <section className="card result-sides">
        <div className="result-pair">
          {left.map((name) => (
            <div key={name} className="big">
              {name}
            </div>
          ))}
        </div>
        <div className="result-vs">—</div>
        <div className="result-pair is-right">
          {right.map((name) => (
            <div key={name} className="big">
              {name}
            </div>
          ))}
        </div>
      </section>

      {sets.map((set, index) => (
        <section className="card result-set" key={index}>
          <div className="label">
            {ru.matches.set} {index + 1}
          </div>
          <div className="score-wheel">
            <div className="score-col">
              <button type="button" className="stepper-btn" onClick={() => bump(index, 'A', 1)}>
                +
              </button>
              <div className="score-digit">{set.gamesA}</div>
              <button type="button" className="stepper-btn" onClick={() => bump(index, 'A', -1)}>
                −
              </button>
            </div>
            <div className="score-colon">:</div>
            <div className="score-col">
              <button type="button" className="stepper-btn" onClick={() => bump(index, 'B', 1)}>
                +
              </button>
              <div className="score-digit">{set.gamesB}</div>
              <button type="button" className="stepper-btn" onClick={() => bump(index, 'B', -1)}>
                −
              </button>
            </div>
          </div>
          {sets.length > 2 && (
            <button type="button" className="btn secondary" onClick={() => setSets((prev) => prev.filter((_, i) => i !== index))}>
              {ru.matches.removeSet}
            </button>
          )}
        </section>
      ))}

      {sets.length < 3 && (
        <button type="button" className="btn secondary" onClick={() => setSets((prev) => [...prev, { gamesA: 0, gamesB: 0 }])}>
          {ru.matches.addSet}
        </button>
      )}

      <button
        type="button"
        className={'btn primary' + (save.isPending ? ' is-busy' : '')}
        disabled={save.isPending}
        onClick={() => {
          setError('');
          save.mutate();
        }}
      >
        {ru.matches.saveResult}
      </button>
      {error && <div className="status wait">{error}</div>}
    </div>
  );
}
