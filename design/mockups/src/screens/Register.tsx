import { ENTRY_FEE, SOLO_FEE, money } from '../data';
import { Screen } from '../ui';

export function RegisterScreen() {
  return (
    <Screen tab="register" hideTabs>
      <div className="back">Назад</div>
      <div className="title">Регистрация</div>

      <div className="seg" role="tablist" aria-label="Тип записи">
        <span className="seg-btn is-on">Парой</span>
        <span className="seg-btn">Один</span>
      </div>
      <p className="hint pad">
        Пара фиксируется на весь турнир. Напарник примет приглашение по ссылке.
      </p>

      <section className="card">
        <div className="label">Ваш рейтинг Lunda</div>
        <div className="stepper">
          <span className="stepper-btn" aria-label="Меньше">
            −
          </span>
          <div className="big">3,4</div>
          <span className="stepper-btn" aria-label="Больше">
            +
          </span>
        </div>
        <div className="hint">Шкала 1,0–7,0. Админ проверит по скриншоту.</div>
      </section>

      <button type="button" className="btn secondary">
        Пригласить напарника
      </button>

      <div className="sticky-pay">
        <button type="button" className="btn primary">
          Оплатить {money(ENTRY_FEE)}
        </button>
        <div className="hint center">Одиночка платит {money(SOLO_FEE)}</div>
      </div>
    </Screen>
  );
}
