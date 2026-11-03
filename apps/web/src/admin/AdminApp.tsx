import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import type { Me } from '../App';
import { api } from '../api';
import { IconDraw, IconOverview, IconPartner, IconPin, IconSettings, IconStaff, IconTrophy } from '../icons';
import { ru } from '../i18n/ru';

const SELECTED_KEY = 'padel.admin.tournamentId';

type Tournament = {
  id: string;
  title: string;
  status: string;
  feePairKopecks: number;
  feeSoloKopecks: number;
  organizerShareBp: number;
  targetEntries: number;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  finalsAt: string | null;
  finalsNote: string | null;
};

type Club = { id: string; name: string; address: string | null };
type Sponsor = { id: string; name: string; description: string | null; kind: string };

const STATUSES = [
  'DRAFT',
  'REGISTRATION',
  'QUALIFICATION',
  'DIVISIONS_READY',
  'PLAYOFF',
  'FINALS',
  'DONE',
  'CANCELLED',
] as const;

function useTournaments() {
  return useQuery({ queryKey: ['admin-tours'], queryFn: () => api<Tournament[]>('/api/v1/admin/tournaments') });
}

function useSelectedId(list: Tournament[] | undefined) {
  const [id, setId] = useState(() => sessionStorage.getItem(SELECTED_KEY) ?? '');
  const current = list?.find((t) => t.id === id) ?? list?.[0] ?? null;
  const select = (next: string) => {
    setId(next);
    sessionStorage.setItem(SELECTED_KEY, next);
  };
  return { current, select };
}

export function AdminApp({ me }: { me: Me }) {
  return (
    <div className="admin">
      <header className="admin-bar">
        <div>
          <div className="admin-title">{ru.admin.title}</div>
          <div className="hint">{ru.admin.playerNote}</div>
        </div>
        <Link to="/" className="btn secondary">
          {ru.admin.back}
        </Link>
      </header>
      <nav className="admin-nav" aria-label="Админка">
        <AdminLink to="/admin" end label={ru.admin.overview} icon={<IconOverview />} />
        <AdminLink to="/admin/championships" label={ru.admin.championships} icon={<IconTrophy />} />
        <AdminLink to="/admin/settings" label={ru.admin.settings} icon={<IconSettings />} />
        <AdminLink to="/admin/clubs" label={ru.admin.clubs} icon={<IconPin />} />
        <AdminLink to="/admin/sponsors" label={ru.admin.sponsors} icon={<IconPartner />} />
        <AdminLink to="/admin/draw" label={ru.admin.draw} icon={<IconDraw />} />
        {me.user.role === 'OWNER' && <AdminLink to="/admin/staff" label={ru.admin.staff} icon={<IconStaff />} />}
      </nav>
      <div className="admin-body">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="championships" element={<Championships />} />
          <Route path="settings" element={<Settings />} />
          <Route path="clubs" element={<Clubs />} />
          <Route path="sponsors" element={<Sponsors />} />
          <Route path="draw" element={<Draw />} />
          <Route path="staff" element={me.user.role === 'OWNER' ? <Staff /> : <p>{ru.admin.onlyOwner}</p>} />
        </Routes>
      </div>
    </div>
  );
}

function AdminLink({ to, label, end, icon }: { to: string; label: string; end?: boolean; icon: ReactNode }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => 'admin-link' + (isActive ? ' is-on' : '')}>
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

function ChampionshipPicker({
  list,
  currentId,
  onSelect,
}: {
  list: Tournament[];
  currentId?: string;
  onSelect: (id: string) => void;
}) {
  if (list.length === 0) return null;
  return (
    <label className="field-label">
      {ru.admin.championship}
      <select className="field" value={currentId ?? ''} onChange={(e) => onSelect(e.target.value)}>
        {list.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title} · {t.status}
          </option>
        ))}
      </select>
    </label>
  );
}

function Overview() {
  const query = useQueryClient();
  const { data: tours } = useTournaments();
  const { current } = useSelectedId(tours);
  const { data } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () =>
      api<{ entries: number; payments: number; disputes: number; pendingRatings: number; tournaments: number; matches: number; sandbox: boolean }>(
        '/api/v1/admin/overview',
      ),
  });
  const [message, setMessage] = useState('');
  const fill = useMutation({
    mutationFn: () => api<{ message: string }>('/api/v1/admin/sandbox/fill', { method: 'POST', body: JSON.stringify({ tournamentId: current?.id }) }),
    onSuccess: (result) => {
      setMessage(result.message);
      void query.invalidateQueries();
    },
  });
  const play = useMutation({
    mutationFn: () => api<{ message: string }>('/api/v1/admin/sandbox/play', { method: 'POST', body: JSON.stringify({ tournamentId: current?.id }) }),
    onSuccess: (result) => {
      setMessage(result.message);
      void query.invalidateQueries();
    },
  });
  const busy = fill.isPending || play.isPending;
  return (
    <div className="page">
      <div className="title">{ru.admin.overview}</div>
      <div className="stats-grid">
        <Stat n={data?.tournaments} label="чемпионатов" />
        <Stat n={data?.entries} label="записей" />
        <Stat n={data?.payments} label="оплат" />
        <Stat n={data?.matches} label="матчей" />
      </div>
      {data?.sandbox && (
        <section className="card">
          <div className="label">{ru.admin.sandbox}</div>
          <p className="hint">{ru.admin.fillHint}</p>
          <button type="button" className="btn secondary" disabled={busy || !current} onClick={() => fill.mutate()}>
            {ru.admin.fillRandom}
          </button>
          <p className="hint">{ru.admin.playHint}</p>
          <button type="button" className="btn primary" disabled={busy || !current} onClick={() => play.mutate()}>
            {busy ? ru.admin.sandboxWait : ru.admin.playRandom}
          </button>
          {(message || fill.isError || play.isError) && (
            <div className={'status ' + (fill.isError || play.isError ? 'wait' : 'ok')}>
              {message || (fill.error as Error | undefined)?.message || (play.error as Error | undefined)?.message}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ n, label }: { n?: number; label: string }) {
  return (
    <section className="card">
      <div className="big">{n ?? '—'}</div>
      <div className="hint">{label}</div>
    </section>
  );
}

function Championships() {
  const query = useQueryClient();
  const navigate = useNavigate();
  const { data } = useTournaments();
  const { select } = useSelectedId(data);
  const [title, setTitle] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api<{ tournament: Tournament }>('/api/v1/admin/tournaments', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || 'Новый чемпионат',
          feePairKopecks: 400000,
          feeSoloKopecks: 200000,
          status: 'DRAFT',
        }),
      }),
    onSuccess: (result) => {
      select(result.tournament.id);
      void query.invalidateQueries({ queryKey: ['admin-tours'] });
      setTitle('');
    },
  });
  return (
    <div className="page">
      <div className="title">{ru.admin.championships}</div>
      {data?.map((t) => (
        <section className="card" key={t.id}>
          <div className="big">{t.title}</div>
          <div className="hint">{t.status}</div>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              select(t.id);
              navigate('/admin/settings');
            }}
          >
            {ru.admin.openSettings}
          </button>
        </section>
      ))}
      <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={ru.admin.titleField} aria-label={ru.admin.titleField} />
      <button type="button" className="btn primary" onClick={() => create.mutate()}>
        {ru.admin.create}
      </button>
    </div>
  );
}

function Settings() {
  const query = useQueryClient();
  const { data } = useTournaments();
  const { current, select } = useSelectedId(data);
  const [form, setForm] = useState<Tournament | null>(null);
  const [saved, setSaved] = useState(false);
  const view = form && form.id === current?.id ? form : current;
  const save = useMutation({
    mutationFn: () => {
      if (!view) throw new Error('no tournament');
      return api(`/api/v1/admin/tournament/${view.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: view.title,
          status: view.status,
          feePairKopecks: Number(view.feePairKopecks),
          feeSoloKopecks: Number(view.feeSoloKopecks),
          organizerShareBp: Number(view.organizerShareBp),
          targetEntries: Number(view.targetEntries),
          registrationOpensAt: view.registrationOpensAt,
          registrationClosesAt: view.registrationClosesAt,
          startsAt: view.startsAt,
          endsAt: view.endsAt,
          finalsAt: view.finalsAt,
          finalsNote: view.finalsNote,
        }),
      });
    },
    onSuccess: () => {
      setSaved(true);
      setForm(null);
      void query.invalidateQueries();
    },
  });
  if (!view) return <div className="page-msg">{ru.home.empty}</div>;
  const set = (patch: Partial<Tournament>) => {
    setSaved(false);
    setForm({ ...view, ...patch });
  };
  return (
    <div className="page">
      <div className="title">{ru.admin.settings}</div>
      <ChampionshipPicker list={data ?? []} currentId={view.id} onSelect={select} />
      <label className="field-label">
        {ru.admin.titleField}
        <input className="field" value={view.title} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label className="field-label">
        {ru.admin.status}
        <select className="field" value={view.status} onChange={(e) => set({ status: e.target.value })}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        {ru.admin.feePair}
        <input className="field" type="number" min={0} value={view.feePairKopecks / 100} onChange={(e) => set({ feePairKopecks: Math.round(Number(e.target.value) * 100) })} />
      </label>
      <label className="field-label">
        {ru.admin.feeSolo}
        <input className="field" type="number" min={0} value={view.feeSoloKopecks / 100} onChange={(e) => set({ feeSoloKopecks: Math.round(Number(e.target.value) * 100) })} />
      </label>
      <label className="field-label">
        {ru.admin.share}
        <input className="field" type="number" min={0} max={100} value={view.organizerShareBp / 100} onChange={(e) => set({ organizerShareBp: Math.round(Number(e.target.value) * 100) })} />
      </label>
      <label className="field-label">
        {ru.admin.target}
        <input className="field" type="number" min={2} value={view.targetEntries} onChange={(e) => set({ targetEntries: Number(e.target.value) })} />
      </label>
      <DateField label={ru.admin.opens} value={view.registrationOpensAt} onChange={(v) => set({ registrationOpensAt: v })} />
      <DateField label={ru.admin.closes} value={view.registrationClosesAt} onChange={(v) => set({ registrationClosesAt: v })} />
      <DateField label={ru.admin.starts} value={view.startsAt} onChange={(v) => set({ startsAt: v })} />
      <DateField label={ru.admin.ends} value={view.endsAt} onChange={(v) => set({ endsAt: v })} />
      <DateField label={ru.admin.finals} value={view.finalsAt} onChange={(v) => set({ finalsAt: v })} />
      <label className="field-label">
        {ru.admin.finalsNote}
        <input className="field" value={view.finalsNote ?? ''} onChange={(e) => set({ finalsNote: e.target.value || null })} />
      </label>
      <button type="button" className="btn primary" onClick={() => save.mutate()}>
        {ru.admin.save}
      </button>
      {saved && <div className="status ok">Сохранено</div>}
      {save.isError && <div className="status wait">{(save.error as Error).message}</div>}
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string | null) => void }) {
  const local = value ? toLocalInput(value) : '';
  return (
    <label className="field-label">
      {label}
      <input
        className="field"
        type="datetime-local"
        value={local}
        onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
      />
    </label>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Clubs() {
  const query = useQueryClient();
  const { data } = useQuery({ queryKey: ['admin-clubs'], queryFn: () => api<Club[]>('/api/v1/admin/clubs') });
  const [draft, setDraft] = useState<Record<string, Club>>({});
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const add = useMutation({
    mutationFn: () => api('/api/v1/admin/clubs', { method: 'POST', body: JSON.stringify({ name: name.trim() || 'Клуб', address: address || null }) }),
    onSuccess: () => {
      setName('');
      setAddress('');
      void query.invalidateQueries({ queryKey: ['admin-clubs'] });
    },
  });
  const save = useMutation({
    mutationFn: (club: Club) => api(`/api/v1/admin/clubs/${club.id}`, { method: 'PUT', body: JSON.stringify({ name: club.name, address: club.address }) }),
    onSuccess: (_, club) => {
      setDraft((prev) => {
        const next = { ...prev };
        delete next[club.id];
        return next;
      });
      void query.invalidateQueries({ queryKey: ['admin-clubs'] });
    },
  });
  return (
    <div className="page">
      <div className="title">{ru.admin.clubs}</div>
      {data?.map((c) => {
        const view = draft[c.id] ?? c;
        return (
          <section className="card" key={c.id}>
            <input className="field" value={view.name} onChange={(e) => setDraft({ ...draft, [c.id]: { ...view, name: e.target.value } })} />
            <input className="field" placeholder={ru.admin.address} value={view.address ?? ''} onChange={(e) => setDraft({ ...draft, [c.id]: { ...view, address: e.target.value || null } })} />
            <button type="button" className="btn secondary" onClick={() => save.mutate(view)}>
              {ru.admin.save}
            </button>
          </section>
        );
      })}
      <input className="field" placeholder={ru.admin.titleField} value={name} onChange={(e) => setName(e.target.value)} />
      <input className="field" placeholder={ru.admin.address} value={address} onChange={(e) => setAddress(e.target.value)} />
      <button type="button" className="btn primary" onClick={() => add.mutate()}>
        {ru.admin.add}
      </button>
    </div>
  );
}

function Sponsors() {
  const query = useQueryClient();
  const { data: tours } = useTournaments();
  const { current, select } = useSelectedId(tours);
  const tournamentId = current?.id;
  const { data } = useQuery({
    queryKey: ['admin-sponsors', tournamentId],
    queryFn: () => api<Sponsor[]>(`/api/v1/admin/sponsors?tournamentId=${tournamentId}`),
    enabled: Boolean(tournamentId),
  });
  const [draft, setDraft] = useState<Record<string, Sponsor>>({});
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const add = useMutation({
    mutationFn: () =>
      api('/api/v1/admin/sponsors', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() || 'Партнёр', kind: 'LOGO', description: description || null, tournamentId }),
      }),
    onSuccess: () => {
      setName('');
      setDescription('');
      void query.invalidateQueries({ queryKey: ['admin-sponsors'] });
    },
  });
  const save = useMutation({
    mutationFn: (s: Sponsor) =>
      api(`/api/v1/admin/sponsors/${s.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: s.name, kind: s.kind || 'LOGO', description: s.description }),
      }),
    onSuccess: (_, s) => {
      setDraft((prev) => {
        const next = { ...prev };
        delete next[s.id];
        return next;
      });
      void query.invalidateQueries({ queryKey: ['admin-sponsors'] });
    },
  });
  return (
    <div className="page">
      <div className="title">{ru.admin.sponsors}</div>
      <ChampionshipPicker list={tours ?? []} currentId={tournamentId} onSelect={select} />
      {data?.map((s) => {
        const view = draft[s.id] ?? s;
        return (
          <section className="card" key={s.id}>
            <input className="field" value={view.name} onChange={(e) => setDraft({ ...draft, [s.id]: { ...view, name: e.target.value } })} />
            <input className="field" placeholder={ru.admin.description} value={view.description ?? ''} onChange={(e) => setDraft({ ...draft, [s.id]: { ...view, description: e.target.value || null } })} />
            <button type="button" className="btn secondary" onClick={() => save.mutate(view)}>
              {ru.admin.save}
            </button>
          </section>
        );
      })}
      <input className="field" placeholder={ru.admin.titleField} value={name} onChange={(e) => setName(e.target.value)} />
      <input className="field" placeholder={ru.admin.description} value={description} onChange={(e) => setDescription(e.target.value)} />
      <button type="button" className="btn primary" disabled={!tournamentId} onClick={() => add.mutate()}>
        {ru.admin.add}
      </button>
    </div>
  );
}

function Draw() {
  const { data: tours } = useTournaments();
  const { current, select } = useSelectedId(tours);
  const [preview, setPreview] = useState<{ seed: string; matches: unknown[]; warnings: string[]; entries: number } | null>(null);
  const [message, setMessage] = useState('');
  const tournamentId = current?.id;
  const generate = async () => {
    if (!tournamentId) return;
    const result = await api<typeof preview>('/api/v1/admin/rounds/preview', {
      method: 'POST',
      body: JSON.stringify({ tournamentId }),
    });
    setPreview(result);
    setMessage('');
  };
  const save = async () => {
    if (!tournamentId) return;
    const result = await api<{ message: string; round: { id: string } }>('/api/v1/admin/rounds', {
      method: 'POST',
      body: JSON.stringify({ tournamentId, seed: preview?.seed }),
    });
    setMessage(result.message);
  };
  return (
    <div className="page">
      <div className="title">{ru.admin.draw}</div>
      <ChampionshipPicker list={tours ?? []} currentId={tournamentId} onSelect={select} />
      <p className="hint">{ru.admin.drawHint}</p>
      <button type="button" className="btn primary" disabled={!tournamentId} onClick={() => void generate()}>
        {ru.admin.generate}
      </button>
      {preview && (
        <section className="card">
          <div className="hint">Сид {preview.seed}</div>
          <div className="hint">Записей: {preview.entries}</div>
          <div className="hint">Матчей в черновике: {preview.matches.length}</div>
          {preview.warnings.map((w) => (
            <div key={w} className="status wait">
              {w}
            </div>
          ))}
          {preview.entries === 0 && <p className="hint">{ru.admin.noEntries}</p>}
        </section>
      )}
      {preview && preview.entries > 0 && (
        <button type="button" className="btn secondary" onClick={() => void save()}>
          {ru.admin.save}
        </button>
      )}
      {message && <div className="status ok">{message}</div>}
    </div>
  );
}

function Staff() {
  const query = useQueryClient();
  const { data } = useQuery({
    queryKey: ['staff'],
    queryFn: () =>
      api<{
        users: Array<{ id: string; firstName: string; role: string; telegramId: string }>;
        grants: Array<{ telegramId: string; role: string }>;
      }>('/api/v1/admin/staff'),
  });
  const [telegramId, setTelegramId] = useState('');
  const changeRole = useMutation({
    mutationFn: (payload: { telegramId: string; role: 'ADMIN' | 'PLAYER' }) =>
      api('/api/v1/admin/staff', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      setTelegramId('');
      void query.invalidateQueries({ queryKey: ['staff'] });
    },
  });
  return (
    <div className="page">
      <div className="title">{ru.admin.staff}</div>
      {data?.users.map((u) => (
        <section className="card" key={u.id}>
          <b>
            {u.firstName} · {u.role}
          </b>
          <span className="hint">{u.telegramId}</span>
          {u.role === 'ADMIN' && (
            <button type="button" className="btn secondary" onClick={() => changeRole.mutate({ telegramId: u.telegramId, role: 'PLAYER' })}>
              {ru.admin.revoke}
            </button>
          )}
        </section>
      ))}
      {data?.grants
        .filter((g) => g.role === 'ADMIN' && !data.users.some((u) => u.telegramId === g.telegramId))
        .map((g) => (
          <section className="card" key={g.telegramId}>
            <b>
              {g.telegramId} · {g.role}
            </b>
            <span className="hint">{ru.admin.pendingGrant}</span>
            <button type="button" className="btn secondary" onClick={() => changeRole.mutate({ telegramId: g.telegramId, role: 'PLAYER' })}>
              {ru.admin.revoke}
            </button>
          </section>
        ))}
      <input className="field" placeholder={ru.admin.telegramId} value={telegramId} onChange={(e) => setTelegramId(e.target.value)} />
      <button type="button" className="btn primary" disabled={!/^\d+$/.test(telegramId)} onClick={() => changeRole.mutate({ telegramId, role: 'ADMIN' })}>
        {ru.admin.grant}
      </button>
    </div>
  );
}
