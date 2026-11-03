import { DIVISIONS, DIVISION_NAMES, ME } from '../data';
import { Screen } from '../ui';

export function TableScreen() {
  const rows = DIVISIONS[1];
  return (
    <Screen tab="table">
      <div className="title">Таблица</div>
      <div className="seg" role="tablist" aria-label="Дивизион">
        {DIVISION_NAMES.map((name, i) => (
          <span key={name} className={'seg-btn' + (i === 1 ? ' is-on' : '')}>
            Див. {i + 1}
          </span>
        ))}
      </div>
      <section className="card flush">
        <div className="trow thead">
          <span>#</span>
          <span>Пара</span>
          <span>И</span>
          <span>В</span>
          <span>Δ</span>
        </div>
        {rows.map((unit, i) => {
          const mine = unit.id === ME.id;
          return (
            <div key={unit.id} className={'trow' + (mine ? ' me' : '')}>
              <span>{i + 1}</span>
              <span className="name">{unit.name}</span>
              <span>{unit.played}</span>
              <span>{unit.wins}</span>
              <span>
                {unit.setDiff > 0 ? '+' : ''}
                {unit.setDiff}
              </span>
            </div>
          );
        })}
      </section>
      <p className="hint pad">Сортировка: победы → личная встреча → разница сетов → разница геймов → жребий</p>
    </Screen>
  );
}
