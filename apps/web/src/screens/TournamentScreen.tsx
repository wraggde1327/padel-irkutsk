import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, isStaticDemo, rememberTournament, type TournamentDto } from '../api';
import { moneyFromKopecks, statusLabel } from '../format';
import { ru } from '../i18n/ru';

export function useTournament(id?: string) {
  return useQuery({
    queryKey: ['tournament', id ?? 'current'],
    queryFn: () => api<TournamentDto>(id ? `/api/v1/tournaments/${id}` : '/api/v1/tournament'),
    enabled: Boolean(id) || !id,
    retry: false,
  });
}

export function TournamentScreen() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useTournament(id);
  if (id && data) rememberTournament(id);
  if (isLoading) return <div className="page-msg">{ru.home.loading}</div>;
  if (isError || !data) {
    return (
      <div className="page">
        <p className="hint">{ru.errors.network}</p>
        <button type="button" className="btn primary" onClick={() => void refetch()}>
          {ru.home.retry}
        </button>
      </div>
    );
  }
  const conditions = data.conditions?.trim();
  return (
    <div className="page">
      <Link to="/" className="back">
        ← {ru.register.back}
      </Link>
      <div className="title">{data.title}</div>
      {isStaticDemo && <p className="status wait">{ru.home.demoBanner}</p>}
      <div className="chip">{statusLabel(data.status, data.startsAt)}</div>
      {conditions && (
        <section className="card">
          <div className="label">{ru.home.conditions}</div>
          <p className="hint keep">{conditions}</p>
        </section>
      )}
      {data.joined ? (
        <>
          <div className="status ok">{ru.register.done}</div>
          <div className="row">
            <Link to={`/t/${data.id}/matches`} className="btn primary">
              {ru.home.myMatches}
            </Link>
            <Link to={`/t/${data.id}/table`} className="btn secondary">
              {ru.home.table}
            </Link>
          </div>
        </>
      ) : (
        <Link to={`/t/${data.id}/register`} className="btn primary">
          {ru.home.participate} · {moneyFromKopecks(data.feePairKopecks)} с пары
        </Link>
      )}
      {data.prizeEnabled && data.prize && (
        <section className="card">
          <div className="label">{ru.home.prize}</div>
          <div className="big">{moneyFromKopecks(data.prize.fund)}</div>
          <div className="hint">{ru.home.prizeHint}</div>
          <div className="prize-row">
            {data.prize.perDivision.map((value, i) => (
              <div key={i} className="prize">
                <span className="hint">Див. {i + 1}</span>
                <b>{moneyFromKopecks(value)}</b>
              </div>
            ))}
          </div>
        </section>
      )}
      {data.clubs.length > 0 && (
        <section className="card">
          <div className="label">{ru.home.venues}</div>
          <div className="chips">
            {data.clubs.map((club) => (
              <span key={club.id} className="chip-item">
                {club.name}
              </span>
            ))}
          </div>
          <div className="hint">{ru.home.venuesHint}</div>
        </section>
      )}
      {data.sponsors.length > 0 && (
        <section className="card">
          <div className="label">{ru.home.partners}</div>
          <div className="sponsors">
            {data.sponsors.map((s) => (
              <div key={s.id} className="sponsor">
                {s.name}
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="hint">{ru.home.nextDraw}</p>
    </div>
  );
}
