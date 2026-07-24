import { describe, expect, it } from 'vitest';
import { readThemePreference, resolveTheme } from './theme';

describe('theme settings', () => {
  it('resolves system theme from OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('falls back to light for missing or invalid saved settings', () => {
    expect(readThemePreference(null)).toBe('light');
    expect(readThemePreference('{bad json')).toBe('light');
    expect(readThemePreference(JSON.stringify({ theme: 'dark' }))).toBe('dark');
  });
});
