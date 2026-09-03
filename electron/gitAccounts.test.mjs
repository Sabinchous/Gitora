import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  deserializeSession,
  findAccount,
  normalizeAccount,
  publicInfo,
  serializeSession,
  snapshot,
} = require('./gitAccounts.cjs');

describe('multi-account session store', () => {
  it('round-trips several accounts and keeps the active one', () => {
    const store = {
      activeId: '',
      accounts: [
        normalizeAccount({ provider: 'github', token: 'gh-token', login: 'alex' }),
        normalizeAccount({ provider: 'gitea', baseUrl: 'https://gitea.example.com', token: 'gitea-token', login: 'sam' }),
      ],
    };
    store.activeId = store.accounts[1].id;
    const restored = deserializeSession(serializeSession(store));
    expect(restored.accounts).toHaveLength(2);
    expect(restored.activeId).toBe(store.accounts[1].id);
    expect(findAccount(restored, store.accounts[0].id)?.login).toBe('alex');
    const snap = snapshot(restored);
    expect(snap.accounts[0]).not.toHaveProperty('token');
    expect(snap).toEqual({ accounts: snap.accounts, activeAccountId: store.accounts[1].id });
  });

  it('migrates legacy single-token sessions', () => {
    const plain = deserializeSession('legacy-github-token');
    expect(plain.accounts).toHaveLength(1);
    expect(plain.accounts[0]).toMatchObject({ provider: 'github', token: 'legacy-github-token' });

    const v1 = deserializeSession(JSON.stringify({ provider: 'gitea', baseUrl: 'https://g.example.com', token: 't' }));
    expect(v1.accounts[0]).toMatchObject({ provider: 'gitea', baseUrl: 'https://g.example.com' });
  });

  it('drops broken entries and falls back to the first account', () => {
    const restored = deserializeSession(JSON.stringify({
      activeId: 'missing',
      accounts: [{ provider: 'github', token: 'ok' }, { provider: 'github', token: '' }],
    }));
    expect(restored.accounts).toHaveLength(1);
    expect(restored.activeId).toBe(restored.accounts[0].id);
    expect(publicInfo(restored.accounts[0])).not.toHaveProperty('token');
  });

  it('rejects empty tokens', () => {
    expect(() => normalizeAccount({ provider: 'github', token: '  ' })).toThrow();
    expect(deserializeSession('')).toEqual({ activeId: '', accounts: [] });
  });
});
