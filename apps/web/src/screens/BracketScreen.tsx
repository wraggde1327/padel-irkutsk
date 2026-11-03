import { ru } from '../i18n/ru';

export function BracketScreen() {
  return (
    <div className="page">
      <div className="title">{ru.bracket.title}</div>
      <section className="card">
        <p className="hint">{ru.bracket.empty}</p>
      </section>
    </div>
  );
}
