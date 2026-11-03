import { ME, ME_FIRST } from '../data';
import { Screen } from '../ui';

export function ProfileScreen() {
  return (
    <Screen tab="profile">
      <div className="title">Профиль</div>
      <section className="card profile">
        <div className="avatar" aria-hidden>
          {ME_FIRST[0]}
        </div>
        <div>
          <div className="big">{ME_FIRST}</div>
          <div className="hint">Участник · {ME.name}</div>
        </div>
      </section>

      <section className="card">
        <div className="stats">
          <div>
            <b>3</b>
            <span className="hint">матча</span>
          </div>
          <div>
            <b>2</b>
            <span className="hint">победы</span>
          </div>
          <div>
            <b>2</b>
            <span className="hint">клуба</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="label">Рейтинг</div>
        <div className="kv">
          <span>Рейтинг турнира</span>
          <b>1 042</b>
        </div>
        <div className="kv">
          <span>Lunda (указан вами)</span>
          <b>3,4</b>
        </div>
        <div className="status wait">Ждёт проверки админом по скриншоту</div>
        <button type="button" className="btn primary">
          Загрузить скриншот Lunda
        </button>
      </section>
    </Screen>
  );
}
