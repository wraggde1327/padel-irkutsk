import { CLUBS, ENTRY_FEE, PARTNERS, money, prizeFund } from '../data';
import { Screen } from '../ui';

export function HomeScreen() {
  const fund = prizeFund(30);
  return (
    <Screen tab="home">
      <div className="title">Падел-турнир, Иркутск</div>
      <div className="chip">Регистрация открыта · старт 10 ноября</div>

      <button type="button" className="btn primary">
        Участвовать в 1 тап · {money(ENTRY_FEE)} с пары
      </button>

      <section className="card">
        <div className="label">Призовой фонд</div>
        <div className="big">{money(fund.fund)}</div>
        <div className="hint">расчёт на 30 оплаченных пар</div>
        <div className="prize-row">
          {fund.perDivision.map((value, i) => (
            <div key={i} className="prize">
              <span className="hint">Див. {i + 1}</span>
              <b>{money(value)}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="label">Площадки</div>
        <div className="chips">
          {CLUBS.map((club) => (
            <span key={club} className="chip-item">
              {club}
            </span>
          ))}
        </div>
        <div className="hint">Играйте на любой из трёх в течение недели</div>
      </section>

      <section className="card">
        <div className="label">Партнёры турнира</div>
        <div className="sponsors">
          {PARTNERS.map((name) => (
            <div key={name} className="sponsor">
              {name}
            </div>
          ))}
        </div>
      </section>
    </Screen>
  );
}
