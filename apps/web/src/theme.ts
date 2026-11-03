import type { CSSProperties } from 'react';

type ThemeParams = Record<string, string | undefined>;

type WebApp = {
  themeParams?: ThemeParams;
  colorScheme?: string;
  initData?: string;
  ready?: () => void;
  expand?: () => void;
};

function tg(): WebApp | undefined {
  const w = window as unknown as { Telegram?: { WebApp?: WebApp } };
  return w.Telegram?.WebApp;
}

export function bootTelegram(): void {
  try {
    void import('@tma.js/sdk-react').then((mod) => {
      if ('init' in mod && typeof mod.init === 'function') mod.init();
    });
  } catch {
    /* вне Telegram */
  }
  const app = tg();
  app?.ready?.();
  app?.expand?.();
  applyTheme();
}

export function applyTheme(): void {
  const app = tg();
  const params = app?.themeParams ?? {};
  const root = document.documentElement;
  const map: Record<string, string> = {
    '--tg-theme-bg-color': params.bg_color ?? params.secondary_bg_color ?? '',
    '--tg-theme-secondary-bg-color': params.secondary_bg_color ?? '',
    '--tg-theme-section-bg-color': params.section_bg_color ?? '',
    '--tg-theme-text-color': params.text_color ?? '',
    '--tg-theme-hint-color': params.hint_color ?? '',
    '--tg-theme-button-color': params.button_color ?? '',
    '--tg-theme-button-text-color': params.button_text_color ?? '',
    '--tg-theme-section-separator-color': params.section_separator_color ?? '',
    '--tg-theme-link-color': params.link_color ?? '',
  };
  for (const [key, value] of Object.entries(map)) {
    if (value) root.style.setProperty(key, value);
  }
  if (app?.colorScheme === 'dark') root.dataset.theme = 'dark';
  else if (app?.colorScheme === 'light') root.dataset.theme = 'light';
}

export function readInitData(): string {
  return tg()?.initData ?? '';
}

export function safeAreaStyle(): CSSProperties {
  return {
    paddingTop: 'var(--tg-safe-area-inset-top, env(safe-area-inset-top, 0px))',
    paddingBottom: 'var(--tg-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))',
  };
}
