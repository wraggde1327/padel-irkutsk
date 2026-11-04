import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, getToken, type PublicUser, type TournamentDto } from './api';
import { ru } from './i18n/ru';
import { AdminApp } from './admin/AdminApp';
import { IconBracket, IconHome, IconMatches, IconProfile, IconTable } from './icons';
import { BracketScreen } from './screens/BracketScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MatchesScreen } from './screens/MatchesScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { RegisterScreen } from './screens/RegisterScreen';
import { TableScreen } from './screens/TableScreen';
import { safeAreaStyle } from './theme';

export type Me = { user: PublicUser; isStaff: boolean };

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/v1/me'),
    enabled: Boolean(getToken()),
    retry: false,
  });
}

export function useTournament() {
  return useQuery({
    queryKey: ['tournament'],
    queryFn: () => api<TournamentDto>('/api/v1/tournament'),
    retry: false,
  });
}

const TABS: Array<{ to: string; id: string; label: string; icon: ReactNode }> = [
  { to: '/', id: 'home', label: ru.tabs.home, icon: <IconHome /> },
  { to: '/matches', id: 'matches', label: ru.tabs.matches, icon: <IconMatches /> },
  { to: '/table', id: 'table', label: ru.tabs.table, icon: <IconTable /> },
  { to: '/bracket', id: 'bracket', label: ru.tabs.bracket, icon: <IconBracket /> },
  { to: '/profile', id: 'profile', label: ru.tabs.profile, icon: <IconProfile /> },
];

export function App() {
  return (
    <Routes>
      <Route path="/admin/*" element={<AdminGate />} />
      <Route path="/*" element={<PlayerShell />} />
    </Routes>
  );
}

function AdminGate() {
  const me = useMe();
  if (!getToken()) return <Navigate to="/profile" replace />;
  if (me.isLoading) return <div className="page-msg">{ru.home.loading}</div>;
  if (!me.data?.isStaff) return <Navigate to="/profile" replace />;
  return <AdminApp me={me.data} />;
}

function PlayerShell() {
  const location = useLocation();
  const hideTabs = location.pathname === '/register';
  const bodyRef = useRef<HTMLDivElement>(null);
  const [barHidden, setBarHidden] = useState(false);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    let last = el.scrollTop;
    let stopTimer = 0;
    const onScroll = () => {
      const y = el.scrollTop;
      if (y > last + 10 && y > 24) setBarHidden(true);
      else if (y < last - 4) setBarHidden(false);
      last = y;
      window.clearTimeout(stopTimer);
      stopTimer = window.setTimeout(() => setBarHidden(false), 350);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.clearTimeout(stopTimer);
    };
  }, [location.pathname]);
  return (
    <div className="shell" style={safeAreaStyle()}>
      <div className="shell-body" ref={bodyRef}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/register" element={<RegisterScreen />} />
          <Route path="/matches" element={<MatchesScreen />} />
          <Route path="/table" element={<TableScreen />} />
          <Route path="/bracket" element={<BracketScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
        </Routes>
      </div>
      {!hideTabs && (
        <nav className={'tabbar' + (barHidden ? ' is-hidden' : '')} aria-label="Разделы">
          {TABS.map((tab) => {
            const on = location.pathname === tab.to;
            return (
              <Link
                key={tab.id}
                to={tab.to}
                className={'tab' + (on ? ' is-on' : '')}
                aria-current={on ? 'page' : undefined}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
