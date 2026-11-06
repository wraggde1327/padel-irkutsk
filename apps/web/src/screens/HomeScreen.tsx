import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../PageHeader';
import { useMe } from '../App';
import { api, getToken, isStaticDemo, rememberTournament, type TournamentCard } from '../api';
import { moneyFromKopecks, statusLabel } from '../format';
import { ru } from '../i18n/ru';

export function useTournamentLists() {
  return useQuery({
    queryKey: ['tournaments', Boolean(getToken())],
    queryFn: () => api<{ available: TournamentCard[]; mine: TournamentCard[] }>('/api/v1/tournaments'),
  });
}

export function HomeScreen() {
  const me = useMe();
  const { data, isLoading, isError, refetch } = useTournamentLists();
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
  const loggedIn = Boolean(getToken() && me.data?.user);
  return (
    <div className="page">
      <div className="title">{ru.appTitle}</div>
      {isStaticDemo && <p className="status wait">{ru.home.demoBanner}</p>}
      {!loggedIn && (
        <Link to="/profile" className="btn primary">
          {ru.auth.title}
        </Link>
      )}
      <Link to="/tournaments" className={loggedIn ? 'btn primary' : 'btn secondary'}>
        {ru.home.tournaments}
      </Link>
      <section className="card">
        <div className="label">{ru.home.mine}</div>
        {data.mine.length === 0 && <p className="hint">{ru.home.mineEmpty}</p>}
        {data.mine.map((item) => (
          <TournamentRow key={item.id} item={item} action={ru.home.open} />
        ))}
      </section>
      {loggedIn && me.data?.user.needsProfile && (
        <Link to="/profile" className="btn secondary">
          {ru.auth.completeTitle}
        </Link>
      )}
      {!loggedIn && (
        <Link to="/profile" className="btn secondary">
          {ru.home.openProfile}
        </Link>
      )}
    </div>
  );
}

export function TournamentsScreen() {
  const { data, isLoading } = useTournamentLists();
  const list = data?.available ?? [];
  return (
    <div className="page">
      <PageHeader title={ru.home.available} />
      {isLoading && <p className="hint">{ru.home.loading}</p>}
      {!isLoading && list.length === 0 && (
        <section className="card empty">
          <p className="hint">{ru.home.availableEmpty}</p>
        </section>
      )}
      {list.map((item) => (
        <section className="card" key={item.id}>
          <TournamentRow item={item} action={ru.home.enter} />
        </section>
      ))}
    </div>
  );
}

function TournamentRow({ item, action }: { item: TournamentCard; action: string }) {
  return (
    <div className="tour-row">
      <div>
        <div className="big">{item.title}</div>
        <div className="hint">{statusLabel(item.status, item.startsAt)}</div>
        <div className="hint">{moneyFromKopecks(item.feePairKopecks)} с пары</div>
      </div>
      <Link to={`/t/${item.id}`} className="btn secondary" onClick={() => rememberTournament(item.id)}>
        {action}
      </Link>
    </div>
  );
}
