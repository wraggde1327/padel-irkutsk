import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyImport,
  defaultSettingsFor,
  emptyStore,
  isFinished,
  loadState,
  newTournament,
  STORAGE_KEY,
} from '../js/state.js';
import {
  buildExportPayload,
  exportFileName,
  irkutskYmd,
  parseImportJson,
} from '../js/backup.js';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('export filename includes Irkutsk date', () => {
  const now = new Date('2026-11-23T20:00:00Z');
  const name = exportFileName('Наш свободный', now);
  assert.match(name, /^padel-наш-свободный-2026-11-2[34]\.json$/);
  assert.equal(name.endsWith('.json'), true);
  assert.equal(irkutskYmd(now).startsWith('2026-11-'), true);
});

test('parseImport accepts v2 payload and v1 dump', () => {
  const v2 = parseImportJson(
    JSON.stringify({
      app: 'padel-mini-tracker',
      version: 2,
      tournaments: [{ name: 'А', players: [], settings: { tournamentFormat: 'americano' } }],
    }),
  );
  assert.equal(v2.length, 1);
  const v1 = parseImportJson(
    JSON.stringify({
      version: 1,
      players: [{ id: 'p1', name: 'Анна', gender: 'F' }],
      settings: { courts: 2 },
      rounds: [],
    }),
  );
  assert.equal(v1.length, 1);
  assert.equal(v1[0].players[0].name, 'Анна');
});

test('parseImport rejects garbage and foreign app', () => {
  assert.throws(() => parseImportJson('not-json'), /не JSON/i);
  assert.throws(
    () => parseImportJson(JSON.stringify({ app: 'other', tournaments: [] })),
    /не файл этого трекера/i,
  );
  assert.throws(() => parseImportJson(JSON.stringify({ app: 'padel-mini-tracker', tournaments: [] })), /нет турниров/i);
});

test('import add never overwrites; replace-all is explicit', () => {
  const store = emptyStore();
  const first = newTournament(store, { name: 'Старый', settings: defaultSettingsFor('free') });
  first.players = [{ id: 'p1', name: 'Анна', gender: 'F' }];
  const incoming = [{ name: 'Новый', players: [], settings: { tournamentFormat: 'americano' } }];
  const added = applyImport(store, incoming, 'add');
  assert.equal(added.added, 1);
  assert.equal(store.tournaments.length, 2);
  assert.equal(store.tournaments[0].name, 'Старый');
  const replaced = applyImport(store, incoming, 'replace-all');
  assert.equal(replaced.added, 1);
  assert.equal(store.tournaments.length, 1);
  assert.equal(store.tournaments[0].name, 'Новый');
  assert.notEqual(store.tournaments[0].id, first.id);
});

test('import replace-one swaps only the open tournament', () => {
  const store = emptyStore();
  const a = newTournament(store, { name: 'A', settings: defaultSettingsFor('free') });
  newTournament(store, { name: 'B', settings: defaultSettingsFor('americano') });
  store.ui.activeId = a.id;
  applyImport(store, [{ name: 'A2', players: [{ id: 'x', name: 'X', gender: 'M' }], settings: {} }], 'replace-one');
  assert.equal(store.tournaments.length, 2);
  assert.equal(store.tournaments[0].name, 'A2');
  assert.equal(store.tournaments[0].id, a.id);
  assert.equal(store.tournaments[0].players[0].name, 'X');
  assert.equal(store.tournaments[1].name, 'B');
});

test('migrate v1 single save into home list', () => {
  const storage = memoryStorage();
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 1,
      players: [{ id: 'p1', name: 'Борис', gender: 'M' }],
      settings: { tournamentFormat: 'mexicano', pointsPreset: 15 },
      rounds: [{ kind: 'regular', matches: [] }],
      nextPlayerNum: 2,
      nextRoundNum: 2,
    }),
  );
  const loaded = loadState(storage);
  assert.equal(loaded.version, 2);
  assert.equal(loaded.ui.screen, 'home');
  assert.equal(loaded.tournaments.length, 1);
  assert.equal(loaded.tournaments[0].players[0].name, 'Борис');
  assert.equal(loaded.tournaments[0].settings.tournamentFormat, 'mexicano');
});

test('migrate even sum presets 16/24/32 become custom', () => {
  const storage = memoryStorage();
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      tournaments: [
        {
          id: 't1',
          name: 'Старая сумма',
          settings: { tournamentFormat: 'americano', scoringMode: 'total', totalPoints: 24 },
          players: [],
          rounds: [],
        },
        {
          id: 't2',
          name: 'Уже 21',
          settings: { tournamentFormat: 'americano', scoringMode: 'total', totalPoints: 21 },
          players: [],
          rounds: [],
        },
      ],
      nextTournamentNum: 3,
      ui: {},
    }),
  );
  const loaded = loadState(storage);
  assert.equal(loaded.tournaments[0].settings.totalPoints, 'custom');
  assert.equal(loaded.tournaments[0].settings.customTotal, 24);
  assert.equal(loaded.tournaments[1].settings.totalPoints, 21);
});

test('migrate drops roundsLimit; missing finishedAt stays open', () => {
  const storage = memoryStorage();
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      version: 2,
      tournaments: [
        {
          id: 't1',
          name: 'Старый',
          settings: { tournamentFormat: 'americano', roundsLimit: '8' },
          players: [],
          rounds: [],
        },
      ],
      nextTournamentNum: 2,
      ui: {},
    }),
  );
  const loaded = loadState(storage);
  assert.equal('roundsLimit' in loaded.tournaments[0].settings, false);
  assert.equal(loaded.tournaments[0].finishedAt, null);
  assert.equal(isFinished(loaded.tournaments[0]), false);
});

test('finishedAt round-trips and import keeps it', () => {
  const store = emptyStore();
  const t = newTournament(store, { name: 'Финиш', settings: defaultSettingsFor('free') });
  t.finishedAt = '2026-11-23T12:00:00.000Z';
  assert.equal(isFinished(t), true);
  const incoming = [{ name: 'Из файла', finishedAt: '2026-01-01T00:00:00.000Z', settings: { tournamentFormat: 'king' } }];
  applyImport(store, incoming, 'add');
  const added = store.tournaments[store.tournaments.length - 1];
  assert.equal(added.finishedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(isFinished(added), true);
});

test('buildExportPayload tags the app', () => {
  const payload = buildExportPayload([{ id: 't1', name: 'X', players: [], settings: {}, rounds: [] }]);
  assert.equal(payload.app, 'padel-mini-tracker');
  assert.equal(payload.version, 2);
  assert.equal(payload.tournaments.length, 1);
});
