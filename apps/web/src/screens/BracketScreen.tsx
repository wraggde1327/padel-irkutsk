import { Link } from 'react-router-dom';
import { IconBracket } from '../icons';
import { ru } from '../i18n/ru';

export function BracketScreen() {
  return (
    <div className="page">
      <div className="title">{ru.bracket.title}</div>
      <section className="card empty">
        <IconBracket />
        <p className="hint">{ru.bracket.empty}</p>
        <Link to="/" className="btn secondary">
          {ru.matches.toHome}
        </Link>
      </section>
    </div>
  );
}
