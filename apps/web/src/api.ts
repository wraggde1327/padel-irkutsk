const TOKEN_KEY = 'padel.jwt';
const TOURNAMENT_KEY = 'padel.player.tournamentId';

export const isStaticDemo = import.meta.env.VITE_STATIC_DEMO === '1';

const DEMO_GET: Record<string, string> = {
  '/api/v1/tournament': 'tournament.json',
  '/api/v1/tournaments': 'tournaments.json',
  '/api/v1/matches': 'matches.json',
  '/api/v1/standings': 'standings.json',
  '/api/v1/bracket': 'bracket.json',
};

function demoFile(path: string): string | null {
  const key = path.split('?')[0];
  if (key.startsWith('/api/v1/tournaments/') && !key.endsWith('/entries')) return 'tournament.json';
  return DEMO_GET[key] ?? null;
}

function demoAsset(file: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}demo-api/${file}`;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function rememberTournament(id: string): void {
  sessionStorage.setItem(TOURNAMENT_KEY, id);
}

export function rememberedTournament(): string {
  return sessionStorage.getItem(TOURNAMENT_KEY) ?? '';
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (isStaticDemo) {
    const method = (init.method ?? 'GET').toUpperCase();
    const file = demoFile(path);
    if (method !== 'GET' || !file) {
      throw new Error('Это публичное демо: запись и вход отключены. Полный запуск — у себя или в Telegram.');
    }
    const response = await fetch(demoAsset(file));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as T;
  }
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  const data = (await response.json().catch(() => ({}))) as T & { error?: { code: string; message: string } };
  if (!response.ok) {
    throw new Error(data.error?.message ?? `HTTP ${response.status}`);
  }
  return data;
}

export type PublicUser = {
  id: string;
  telegramId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  role: 'PLAYER' | 'ADMIN' | 'OWNER';
  lundaRating: string | number | null;
  lundaStatus: string;
  internalRating: number;
};

export type TournamentCard = {
  id: string;
  title: string;
  status: string;
  startsAt: string | null;
  feePairKopecks: number;
  joined: boolean;
};

export type TournamentDto = {
  id: string;
  title: string;
  status: string;
  timezone: string;
  feePairKopecks: number;
  feeSoloKopecks: number;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  finalsAt: string | null;
  conditions: string | null;
  prizeEnabled: boolean;
  prize: { fund: number; perDivision: number[]; organizer: number; gross: number } | null;
  clubs: Array<{ id: string; name: string; address: string | null }>;
  sponsors: Array<{ id: string; name: string; description: string | null }>;
  joined?: boolean;
};
