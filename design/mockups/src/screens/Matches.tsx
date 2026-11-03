import { MATCHES, ME } from '../data';
import { Screen } from '../ui';

export function MatchesScreen() {
  return (
    <Screen tab="matches">
      <div className="title">Мои матчи</div>
      {MATCHES.map((match) => (
        <section className="card" key={match.id}>
          <div className="label">{match.stage}</div>
          <div className="big">
            {ME.name} — {match.opponent}
          </div>

          {match.status === 'to_play' && (
            <>
              <div className="hint">Срок: {match.deadline}. Не сыграете — техническое поражение.</div>
              <div className="row">
                <button type="button" className="btn secondary">
                  Написать сопернику
                </button>
                <button type="button" className="btn primary">
                  Внести результат
                </button>
              </div>
            </>
          )}

          {match.status === 'awaiting_me' && (
            <>
              <div className="hint">
                Соперник внёс: {match.score} в их пользу · {match.club}
              </div>
              <div className="row">
                <button type="button" className="btn secondary">
                  Спор
                </button>
                <button type="button" className="btn primary">
                  Подтвердить
                </button>
              </div>
            </>
          )}

          {match.status === 'done' && (
            <div className={'status ' + (match.won ? 'ok' : 'bad')}>
              {match.won ? 'Победа' : 'Поражение'} · {match.score} · {match.club}
            </div>
          )}
        </section>
      ))}
    </Screen>
  );
}
