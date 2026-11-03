import { DIVISIONS, DIVISION_NAMES, ME, makeBracket } from '../data';
import { Screen } from '../ui';

export function BracketScreen() {
  const rounds = makeBracket(DIVISIONS[1], 1);
  return (
    <Screen tab="bracket">
      <div className="title">Сетка</div>
      <div className="seg" role="tablist" aria-label="Дивизион">
        {DIVISION_NAMES.map((name, i) => (
          <span key={name} className={'seg-btn' + (i === 1 ? ' is-on' : '')}>
            Див. {i + 1}
          </span>
        ))}
      </div>
      <div className="bracket-scroll">
        <div className="bracket">
          {rounds.map((round) => (
            <div className="round" key={round.title}>
              <div className="label">{round.title}</div>
              <div className="round-col">
                {round.matches.map((match, i) => (
                  <div className="bmatch" key={i}>
                    {[match.a, match.b].map((slot, j) => {
                      const mine = slot.unit?.id === ME.id;
                      return (
                        <div key={j} className={'slot' + (slot.winner ? ' win' : '') + (mine ? ' me' : '')}>
                          <span className="name">{slot.unit ? slot.unit.name : slot.label}</span>
                          {slot.score && <b>{slot.score}</b>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="hint pad">Пары 1–6 сразу в 1/4. Призовые места: 1-е и 2-е в дивизионе.</p>
    </Screen>
  );
}
