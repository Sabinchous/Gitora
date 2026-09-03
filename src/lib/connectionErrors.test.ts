import { describe, expect, it } from 'vitest';
import { connectionError } from './connectionErrors';

describe('connectionError', () => {
  it('returns explicit copy for permission failures', () => {
    expect(connectionError('permissions').title).toContain('прав');
    expect(connectionError('permissions').actionKind).toBe('reauthorize');
  });

  it('recognizes network messages when no code is provided', () => {
    expect(connectionError(undefined, 'Нет подключения к интернету').kind).toBe('network');
  });

  it('keeps token authentication errors focused on reconnecting with a PAT', () => {
    const error = connectionError('auth');
    expect(error.actionKind).toBe('reauthorize');
    expect(error.description).not.toContain('идентификатор приложения');
  });

  it('surfaces the backend message for unknown failures', () => {
    const error = connectionError('gitea', 'Gitea вернул ошибку 403');
    expect(error.kind).toBe('unknown');
    expect(error.description).toBe('Gitea вернул ошибку 403');
  });
});
