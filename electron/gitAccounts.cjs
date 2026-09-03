// Multi-account session store for Gitora (pure logic, no Electron dependency).
//
// A session is { activeId, accounts } where each account is
// { id, provider: 'github' | 'gitea', baseUrl, token, login }.
// Tokens live only in memory and in the encrypted session file; IPC only ever
// exposes public info { id, provider, baseUrl, login }.

const crypto = require('crypto');

function cleanString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeAccount(input) {
  const data = input && typeof input === 'object' ? input : {};
  const provider = data.provider === 'gitea' ? 'gitea' : 'github';
  const baseUrl = provider === 'gitea' ? cleanString(data.baseUrl) : '';
  const token = cleanString(data.token).trim();
  const login = cleanString(data.login);
  if (!token) throw new Error('Пустой токен аккаунта');
  return {
    id: cleanString(data.id) || crypto.randomUUID(),
    provider,
    baseUrl,
    token,
    login,
  };
}

function publicInfo(account) {
  return {
    id: account.id,
    provider: account.provider,
    baseUrl: account.baseUrl,
    login: account.login,
  };
}

function snapshot(store) {
  const accounts = Array.isArray(store?.accounts) ? store.accounts : [];
  return {
    accounts: accounts.map(publicInfo),
    activeAccountId: cleanString(store?.activeId),
  };
}

function serializeSession(store) {
  const accounts = Array.isArray(store?.accounts) ? store.accounts.map(normalizeAccount) : [];
  return JSON.stringify({
    version: 2,
    activeId: cleanString(store?.activeId) || (accounts[0] ? accounts[0].id : ''),
    accounts,
  });
}

// Accepts: v2 multi-account JSON, v1 { provider, baseUrl, token } JSON,
// legacy plain-token string (GitHub). Always returns { activeId, accounts }
// with full account objects (tokens included, caller keeps them in memory).
function deserializeSession(decrypted) {
  const value = typeof decrypted === 'string' ? decrypted : '';
  if (!value) return { activeId: '', accounts: [] };
  try {
    const parsed = JSON.parse(value);
    if (parsed && Array.isArray(parsed.accounts)) {
      const accounts = parsed.accounts
        .map(candidate => {
          try {
            return normalizeAccount(candidate);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const activeId = accounts.some(account => account.id === parsed.activeId)
        ? parsed.activeId
        : (accounts[0] ? accounts[0].id : '');
      return { activeId, accounts };
    }
    if (parsed && typeof parsed.token === 'string' && parsed.token.trim()) {
      const single = normalizeAccount({
        provider: parsed.provider === 'gitea' ? 'gitea' : 'github',
        baseUrl: parsed.baseUrl,
        token: parsed.token,
      });
      return { activeId: single.id, accounts: [single] };
    }
  } catch {
    // Legacy plain-token session below.
  }
  if (value.trim()) {
    const single = normalizeAccount({ provider: 'github', token: value });
    return { activeId: single.id, accounts: [single] };
  }
  return { activeId: '', accounts: [] };
}

function findAccount(store, id) {
  const accounts = Array.isArray(store?.accounts) ? store.accounts : [];
  return accounts.find(account => account.id === id) || null;
}

module.exports = {
  deserializeSession,
  findAccount,
  normalizeAccount,
  publicInfo,
  serializeSession,
  snapshot,
};
