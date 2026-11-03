import { Link } from 'react-router-dom';
import { useTournament } from '../App';
import { formatDate, moneyFromKopecks } from '../format';
import { ru } from '../i18n/ru';

export function HomeScreen() {
  const { data, isLoading, isError, refetch } = useTournament();
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
  return (
    <div className="page">
      <div className="title">{data.title}</div>
      <div className="chip">{statusLabel(data.status, data.startsAt)}</div>
      <Link to="/register" className="btn primary">
        {ru.home.participate} · {moneyFromKopecks(data.feePairKopecks)} с пары
      </Link>
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
      <p className="hint">{ru.home.nextDraw}</p>
    </div>
  );
}

function statusLabel(status: string, startsAt: string | null): string {
  if (status === 'REGISTRATION') return `Регистрация открыта${startsAt ? ` · старт ${formatDate(startsAt)}` : ''}`;
  return status;
}
