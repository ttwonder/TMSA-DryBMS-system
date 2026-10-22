export const DISPLAY_THEMES = ['normal', 'dark', 'eye'] as const;
export type DisplayTheme = typeof DISPLAY_THEMES[number];
export const DISPLAY_THEME_KEY = 'fpmc-compliance-theme';

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function normalizeDisplayTheme(value: unknown): DisplayTheme {
  return value === 'dark' || value === 'eye' ? value : 'normal';
}

export function loadDisplayTheme(storage?: Pick<ThemeStorage, 'getItem'>): DisplayTheme {
  try {
    return normalizeDisplayTheme((storage ?? globalThis.localStorage).getItem(DISPLAY_THEME_KEY));
  } catch {
    return 'normal';
  }
}

export function persistDisplayTheme(theme: DisplayTheme, storage?: Pick<ThemeStorage, 'setItem'>): boolean {
  try {
    (storage ?? globalThis.localStorage).setItem(DISPLAY_THEME_KEY, theme);
    return true;
  } catch {
    // A blocked/full preference store must not prevent an in-memory display change.
    return false;
  }
}

export function applyDisplayTheme(theme: DisplayTheme, root: Pick<HTMLElement, 'dataset'> = document.documentElement): void {
  root.dataset.theme = theme;
}
