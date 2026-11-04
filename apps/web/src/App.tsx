import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, getToken, rememberedTournament, type PublicUser } from './api';
import { ru } from './i18n/ru';
import { AdminApp } from './admin/AdminApp';
import { IconBracket, IconHome, IconMatches, IconProfile, IconTable } from './icons';
import { BracketScreen } from './screens/BracketScreen';
import { HomeScreen, TournamentsScreen } from './screens/HomeScreen';
import { MatchesScreen } from './screens/MatchesScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { RegisterScreen } from './screens/RegisterScreen';
import { TableScreen } from './screens/TableScreen';
import { TournamentScreen } from './screens/TournamentScreen';
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
  const hideTabs = /\/register$/.test(location.pathname);
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
          <Route path="/tournaments" element={<TournamentsScreen />} />
          <Route path="/t/:id" element={<TournamentScreen />} />
          <Route path="/t/:id/register" element={<RegisterScreen />} />
          <Route path="/t/:id/matches" element={<MatchesScreen />} />
          <Route path="/t/:id/table" element={<TableScreen />} />
          <Route path="/t/:id/bracket" element={<BracketScreen />} />
          <Route path="/register" element={<LegacyRegister />} />
          <Route path="/matches" element={<MatchesScreen />} />
          <Route path="/table" element={<TableScreen />} />
          <Route path="/bracket" element={<BracketScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
        </Routes>
      </div>
      {!hideTabs && <TabBar hidden={barHidden} />}
    </div>
  );
}

function LegacyRegister() {
  const id = rememberedTournament();
  if (id) return <Navigate to={`/t/${id}/register`} replace />;
  return <Navigate to="/tournaments" replace />;
}

function TabBar({ hidden }: { hidden: boolean }) {
  const location = useLocation();
  const tid = location.pathname.match(/^\/t\/([^/]+)/)?.[1] || rememberedTournament();
  const tabs: Array<{ to: string; id: string; label: string; icon: ReactNode; on: boolean }> = [
    { to: '/', id: 'home', label: ru.tabs.home, icon: <IconHome />, on: location.pathname === '/' || location.pathname === '/tournaments' },
    { to: tid ? `/t/${tid}/matches` : '/tournaments', id: 'matches', label: ru.tabs.matches, icon: <IconMatches />, on: location.pathname.includes('/matches') },
    { to: tid ? `/t/${tid}/table` : '/tournaments', id: 'table', label: ru.tabs.table, icon: <IconTable />, on: location.pathname.includes('/table') },
    { to: tid ? `/t/${tid}/bracket` : '/tournaments', id: 'bracket', label: ru.tabs.bracket, icon: <IconBracket />, on: location.pathname.includes('/bracket') },
    { to: '/profile', id: 'profile', label: ru.tabs.profile, icon: <IconProfile />, on: location.pathname === '/profile' },
  ];
  return (
    <nav className={'tabbar' + (hidden ? ' is-hidden' : '')} aria-label="Разделы">
      {tabs.map((tab) => (
        <Link key={tab.id} to={tab.to} className={'tab' + (tab.on ? ' is-on' : '')} aria-current={tab.on ? 'page' : undefined}>
          {tab.icon}
          <span>{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
