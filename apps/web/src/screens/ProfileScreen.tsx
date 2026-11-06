import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useMe } from '../App';
import { PageHeader } from '../PageHeader';
import { api, getToken, isStaticDemo, setToken, type PublicUser } from '../api';
import { ru } from '../i18n/ru';
import { AuthPanel, ProfileCompleteForm } from './AuthPanel';

export function ProfileScreen() {
  const me = useMe();
  const user = me.data?.user;
  const loggedIn = Boolean(getToken() && user);

  if (!getToken()) {
    return (
      <div className="page">
        <PageHeader title={ru.profile.title} />
        {!isStaticDemo && <AuthPanel />}
        {!isStaticDemo && <DevRoles />}
        {isStaticDemo && <p className="hint">{ru.home.demoBanner}</p>}
      </div>
    );
  }

  if (me.isLoading) return <div className="page-msg">{ru.home.loading}</div>;

  return (
    <div className="page">
      <PageHeader title={ru.profile.title} />
      <section className="card profile">
        <div className="avatar">{(user?.firstName ?? ru.profile.guest)[0]}</div>
        <div>
          <div className="big">{user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : ru.profile.guest}</div>
          <div className="hint">{roleLabel(user)}</div>
        </div>
      </section>
      {user?.needsProfile && <ProfileCompleteForm user={user} />}
      {user && !user.needsProfile && (
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
          {user.phone && (
            <div className="kv">
              <span>{ru.auth.phoneField}</span>
              <b>{user.phone}</b>
            </div>
          )}
        </section>
      )}
      {me.data?.isStaff && (
        <>
          <Link to="/admin" className="btn primary">
            {ru.profile.adminLink}
          </Link>
          <Link to="/" className="btn secondary">
            {ru.profile.openAppAsPlayer}
          </Link>
        </>
      )}
      {isStaticDemo && <p className="hint">{ru.home.demoBanner}</p>}
      {!isStaticDemo && <DevRoles current={user?.role} />}
      {loggedIn && <LogoutButton />}
    </div>
  );
}

function roleLabel(user?: PublicUser): string {
  if (!user) return ru.profile.openTelegram;
  if (user.role === 'OWNER') return ru.profile.nowOwner;
  if (user.role === 'ADMIN') return ru.profile.nowAdmin;
  if (user.authChannel === 'GUEST') return ru.auth.guest;
  return ru.profile.nowPlaying;
}

function LogoutButton() {
  const query = useQueryClient();
  return (
    <button
      type="button"
      className="btn secondary"
      onClick={() => {
        setToken(null);
        void query.invalidateQueries();
      }}
    >
      {ru.profile.logout}
    </button>
  );
}

function DevRoles({ current }: { current?: PublicUser['role'] }) {
  const query = useQueryClient();
  const login = async (telegramId: string, firstName: string) => {
    setToken(null);
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
      <p className="hint">{ru.profile.switchHint}</p>
      <button
        type="button"
        className={'btn' + (current === 'PLAYER' ? ' primary' : ' secondary')}
        onClick={() => void login('1001', 'Игрок')}
      >
        {ru.profile.asPlayer}
      </button>
      <button
        type="button"
        className={'btn' + (current === 'ADMIN' ? ' primary' : ' secondary')}
        onClick={() => void login('2002', 'Админ')}
      >
        {ru.profile.asAdmin}
      </button>
      <button
        type="button"
        className={'btn' + (current === 'OWNER' ? ' primary' : ' secondary')}
        onClick={() => void login('9009', 'Владелец')}
      >
        {ru.profile.asOwner}
      </button>
    </section>
  );
}
