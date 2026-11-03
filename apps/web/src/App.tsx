import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, getToken, type PublicUser, type TournamentDto } from './api';
import { ru } from './i18n/ru';
import { AdminApp } from './admin/AdminApp';
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

const TABS = [
  { to: '/', id: 'home', label: ru.tabs.home },
  { to: '/matches', id: 'matches', label: ru.tabs.matches },
  { to: '/table', id: 'table', label: ru.tabs.table },
  { to: '/bracket', id: 'bracket', label: ru.tabs.bracket },
  { to: '/profile', id: 'profile', label: ru.tabs.profile },
] as const;

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
  return (
    <div className="shell" style={safeAreaStyle()}>
      <div className="shell-body">
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
        <nav className="tabbar" aria-label="Разделы">
          {TABS.map((tab) => (
            <Link key={tab.id} to={tab.to} className={'tab' + (location.pathname === tab.to ? ' is-on' : '')}>
              <span>{tab.label}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
