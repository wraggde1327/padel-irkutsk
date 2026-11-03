import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useMe } from '../App';
import { api, setToken, type PublicUser } from '../api';
import { ru } from '../i18n/ru';

export function ProfileScreen() {
  const me = useMe();
  const user = me.data?.user;
  return (
    <div className="page">
      <div className="title">{ru.profile.title}</div>
      <section className="card profile">
        <div className="avatar">{(user?.firstName ?? ru.profile.guest)[0]}</div>
        <div>
          <div className="big">{user ? user.firstName : ru.profile.guest}</div>
          <div className="hint">{roleLabel(user?.role)}</div>
        </div>
      </section>
      {user && (
        <section className="card">
          <div className="label">{ru.profile.rating}</div>
          <div className="kv">
            <span>{ru.profile.tournamentRating}</span>
            <b>{user.internalRating}</b>
          </div>
          <div className="kv">
            <span>{ru.profile.lunda}</span>
            <b>{user.lundaRating ?? '—'}</b>
          </div>
          <div className="status wait">{ru.profile.pending}</div>
        </section>
      )}
      {me.data?.isStaff && (
        <Link to="/admin" className="btn primary">
          {ru.profile.adminLink}
        </Link>
      )}
      <DevLogin />
    </div>
  );
}

function roleLabel(role?: PublicUser['role']): string {
  if (role === 'OWNER') return ru.profile.owner;
  if (role === 'ADMIN') return ru.profile.admin;
  if (role === 'PLAYER') return ru.profile.player;
  return ru.profile.openTelegram;
}

function DevLogin() {
  const query = useQueryClient();
  const login = async (telegramId: string, firstName: string) => {
    const result = await api<{ token: string }>('/api/v1/auth/dev', {
      method: 'POST',
      body: JSON.stringify({ telegramId, firstName }),
    });
    setToken(result.token);
    await query.invalidateQueries();
  };
  return (
    <section className="card">
      <div className="label">{ru.profile.loginDev}</div>
      <div className="row">
        <button type="button" className="btn secondary" onClick={() => void login('1001', 'Игрок')}>
          {ru.profile.asPlayer}
        </button>
        <button type="button" className="btn secondary" onClick={() => void login('2002', 'Админ')}>
          {ru.profile.asAdmin}
        </button>
      </div>
      <button type="button" className="btn secondary" onClick={() => void login('9009', 'Владелец')}>
        {ru.profile.asOwner}
      </button>
    </section>
  );
}
