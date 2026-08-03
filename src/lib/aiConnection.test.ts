import { describe, expect, it } from 'vitest';
import { aiLevelLabel, aiLevelTone, diagnosticsSummary } from './aiConnection';

describe('aiConnection helpers', () => {
  it('maps connection levels to clear user-facing labels and tones', () => {
    expect(aiLevelLabel('ready')).toBe('Подключено');
    expect(aiLevelLabel('not_configured')).toBe('Не настроено');
    expect(aiLevelLabel('attention')).toBe('Ожидает MCP-сессию — подключить сейчас');
    expect(aiLevelLabel('error')).toBe('Ошибка подключения');
    expect(aiLevelTone('attention')).toBe('warning');
    expect(aiLevelTone('error')).toBe('danger');
  });

  it('summarizes diagnostic success, warning and error states', () => {
    expect(diagnosticsSummary([
      { id: 'one', label: 'One', status: 'success', detail: 'ok' },
      { id: 'two', label: 'Two', status: 'skipped', detail: 'later' },
      { id: 'three', label: 'Three', status: 'error', detail: 'no' },
    ])).toEqual({ success: 1, warning: 1, error: 1 });
  });
});
