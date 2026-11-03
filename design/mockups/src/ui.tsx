import type { ReactNode } from 'react';

export type TabId = 'home' | 'matches' | 'table' | 'bracket' | 'profile';

export const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Главная' },
  { id: 'matches', label: 'Матчи' },
  { id: 'table', label: 'Таблица' },
  { id: 'bracket', label: 'Сетка' },
  { id: 'profile', label: 'Профиль' },
];

export function Screen({
  children,
  tab,
  hideTabs = false,
}: {
  children: ReactNode;
  tab: TabId | 'register';
  hideTabs?: boolean;
}) {
  return (
    <div className="screen">
      <div className="screen-body">{children}</div>
      {!hideTabs && (
        <nav className="tabbar" aria-label="Разделы">
          {TABS.map((item) => (
            <span
              key={item.id}
              className={'tab' + (tab === item.id ? ' is-on' : '')}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              <TabMark id={item.id} />
              <span>{item.label}</span>
            </span>
          ))}
        </nav>
      )}
    </div>
  );
}

function TabMark({ id }: { id: TabId }) {
  if (id === 'home') {
    return (
      <svg className="tab-mark" viewBox="0 0 24 24" aria-hidden>
        <path fill="currentColor" d="M12 3.2 4 10v10h5.2v-6.2h5.6V20H20V10z" />
      </svg>
    );
  }
  if (id === 'matches') {
    return (
      <svg className="tab-mark" viewBox="0 0 24 24" aria-hidden>
        <circle cx="8" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="16" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (id === 'table') {
    return (
      <svg className="tab-mark" viewBox="0 0 24 24" aria-hidden>
        <path fill="currentColor" d="M5 6h14v2.2H5zm0 4.9h14v2.2H5zm0 4.9h14V18H5z" />
      </svg>
    );
  }
  if (id === 'bracket') {
    return (
      <svg className="tab-mark" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          d="M6 6h5v5H6zm7 3h5M13 16h5M8.5 11v5H13M6 14.5h5V20H6"
        />
      </svg>
    );
  }
  return (
    <svg className="tab-mark" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8.2" r="3.2" fill="currentColor" />
      <path fill="currentColor" d="M5.4 19.2c.7-3.2 3.3-5 6.6-5s5.9 1.8 6.6 5z" />
    </svg>
  );
}
