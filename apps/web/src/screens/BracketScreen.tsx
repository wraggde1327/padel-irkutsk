import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../PageHeader';
import { api, rememberedTournament } from '../api';
import { IconBracket } from '../icons';
import { ru } from '../i18n/ru';
import { MatchCard, type MatchDto } from './MatchesScreen';

type DivisionBracket = {
  id: string;
  number: number;
  title: string;
  rounds: Array<{ id: string; title: string; matches: MatchDto[] }>;
};

export function BracketScreen() {
  const { id } = useParams<{ id: string }>();
  const tournamentId = id || rememberedTournament();
  const q = tournamentId ? `?tournamentId=${tournamentId}` : '';
  const { data } = useQuery({
    queryKey: ['bracket', tournamentId],
    queryFn: () => api<{ divisions: DivisionBracket[] }>(`/api/v1/bracket${q}`),
  });
  const divisions = data?.divisions ?? [];
  const [active, setActive] = useState(0);
  const current = divisions[active] ?? divisions[0];
  return (
    <div className="page">
      <PageHeader title={ru.bracket.title} backTo={tournamentId ? `/t/${tournamentId}` : '/'} />
      {divisions.length === 0 && (
        <section className="card empty">
          <IconBracket />
          <p className="hint">{ru.bracket.empty}</p>
        </section>
      )}
      {divisions.length > 1 && (
        <div className="seg">
          {divisions.map((division, index) => (
            <button
              key={division.id}
              type="button"
              className={'seg-btn' + (current?.id === division.id ? ' is-on' : '')}
              onClick={() => setActive(index)}
            >
              {division.number}
            </button>
          ))}
        </div>
      )}
      {current?.rounds.map((round) => (
        <div key={round.id} className="bracket-round">
          <div className="label">{round.title}</div>
          {round.matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      ))}
    </div>
  );
}
