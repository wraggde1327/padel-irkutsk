import { useEffect, useMemo, useState } from 'react';
import { Phone } from './phone/Phone';
import { BracketScreen } from './screens/Bracket';
import { HomeScreen } from './screens/Home';
import { MatchesScreen } from './screens/Matches';
import { ProfileScreen } from './screens/Profile';
import { RegisterScreen } from './screens/Register';
import { TableScreen } from './screens/Table';

const SCENES = [
  { id: 'home', title: 'Главная', node: <HomeScreen /> },
  { id: 'register', title: 'Регистрация', node: <RegisterScreen /> },
  { id: 'matches', title: 'Мои матчи', node: <MatchesScreen /> },
  { id: 'table', title: 'Таблица', node: <TableScreen /> },
  { id: 'bracket', title: 'Сетка', node: <BracketScreen /> },
  { id: 'profile', title: 'Профиль', node: <ProfileScreen /> },
] as const;

type Theme = 'light' | 'dark';

function readTheme(): Theme {
  const fromUrl = new URLSearchParams(window.location.search).get('theme');
  return fromUrl === 'dark' ? 'dark' : 'light';
}

function readFocus(): string | null {
  return new URLSearchParams(window.location.search).get('screen');
}

export function Overview() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const focus = useMemo(() => readFocus(), []);
  const dark = theme === 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const scenes = focus ? SCENES.filter((scene) => scene.id === focus) : SCENES;
  const single = scenes.length === 1;

  return (
    <div className={'board' + (single ? ' is-single' : '')} data-theme={theme}>
      <header className="board-bar">
        <div>
          <div className="board-title">Падел-турнир, Иркутск</div>
          <div className="board-sub">Этап 0 · макеты Stageshow / Phone · тестовые данные</div>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        >
          {dark ? 'Светлая тема' : 'Тёмная тема'}
        </button>
      </header>

      <div className={'gallery' + (single ? ' is-single' : '')}>
        {scenes.map((scene) => (
          <figure key={scene.id} className="shot" data-screen={scene.id}>
            <figcaption>{scene.title}</figcaption>
            <Phone width={single ? 390 : 340} dark={dark}>
              {scene.node}
            </Phone>
          </figure>
        ))}
      </div>
    </div>
  );
}
