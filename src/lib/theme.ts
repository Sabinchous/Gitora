export type ThemePreference = 'light' | 'dark' | 'system';

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): 'light' | 'dark' {
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}

export function readThemePreference(storageValue: string | null): ThemePreference {
  if (!storageValue) return 'light';
  try {
    const parsed = JSON.parse(storageValue) as { theme?: unknown };
    return parsed.theme === 'dark' || parsed.theme === 'system' ? parsed.theme : 'light';
  } catch {
    return 'light';
  }
}

export function applyThemePreference(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
  prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches,
) {
  root.dataset.themePreference = preference;
  root.dataset.theme = resolveTheme(preference, prefersDark);
}
