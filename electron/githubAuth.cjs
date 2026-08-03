const TOKEN_TYPES = [
  ['github_pat_', 'Fine-grained PAT'],
  ['ghp_', 'Classic PAT'],
  ['gho_', 'OAuth token'],
  ['ghs_', 'GitHub App installation token'],
  ['ghu_', 'GitHub App user token'],
];

function detectGitHubAuthType(token) {
  const value = typeof token === 'string' ? token.trim() : '';
  if (!value) return 'None';
  const tokenType = TOKEN_TYPES.find(([prefix]) => value.startsWith(prefix));
  return tokenType?.[1] || 'Bearer token (unrecognized)';
}

function parseGitHubHeaderList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseGitHubPermissionHeader(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .reduce((permissions, item) => {
      const separator = item.indexOf('=');
      if (separator === -1) permissions[item] = true;
      else permissions[item.slice(0, separator).trim()] = item.slice(separator + 1).trim();
      return permissions;
    }, {});
}

function repositoryFromEndpoint(endpoint) {
  const match = typeof endpoint === 'string' && endpoint.match(/^\/repos\/([^/]+\/[^/?]+)/);
  return match ? match[1] : '';
}

function githubWriteRequirement(method = 'GET', endpoint = '') {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const normalizedEndpoint = String(endpoint || '');
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') return '';

  if (normalizedEndpoint.includes('/contents/')) {
    return normalizedEndpoint.includes('/.github/workflows/')
      ? 'Contents: write; Workflows: write'
      : 'Contents: write';
  }
  if (/\/git\/(blobs|trees|commits|refs)(\/|$)/.test(normalizedEndpoint)) return 'Contents: write';
  if (/\/pulls(\/|$)/.test(normalizedEndpoint)) return 'Pull requests: write';
  if (/\/issues\/\d+\/comments$/.test(normalizedEndpoint)) return 'Issues: write or Pull requests: write';
  if (/\/issues(\/|$)/.test(normalizedEndpoint)) return 'Issues: write';
  return 'Repository write permission';
}

function buildGitHubPermissionChecks({ permissions = {}, scopes = [], acceptedPermissions = {} } = {}) {
  const scopeSet = new Set(scopes.map(scope => String(scope).toLowerCase()));
  const accepted = Object.fromEntries(Object.entries(acceptedPermissions).map(([key, value]) => [key.toLowerCase(), String(value).toLowerCase()]));
  const classicRepoScope = scopeSet.has('repo') || scopeSet.has('public_repo');
  const check = (action, permission, key, availableByRepository = false, missingByRepository = false) => {
    if (accepted[key] === 'write' || accepted[key] === 'admin' || accepted[key] === 'true' || classicRepoScope || availableByRepository) {
      return { action, permission, status: 'available', detail: `${permission} доступно подключению.` };
    }
    if (accepted[key] === 'read' || accepted[key] === 'false' || missingByRepository) {
      return { action, permission, status: 'missing', detail: `GitHub не предоставил ${permission}.` };
    }
    return { action, permission, status: 'unknown', detail: `GitHub не сообщил состояние ${permission}; повторите диагностику после операции.` };
  };

  return [
    check('Создание файла и commit', 'Contents: write', 'contents', permissions.push === true, permissions.push === false),
    check('Создание Issue и комментария', 'Issues: write', 'issues'),
    check('Создание Pull Request', 'Pull requests: write', 'pull_requests'),
    check('Чтение репозитория', 'Metadata: read', 'metadata', permissions.pull === true, permissions.pull === false),
  ];
}

function authSnapshot({ user = '', authType = 'None', tokenSource = 'none', scopes = [], acceptedScopes = [], permissions = {}, acceptedPermissions = {}, repository = '' } = {}) {
  return {
    user: user || '',
    authType,
    tokenSource,
    permissions: { ...permissions },
    scopes: [...scopes],
    acceptedScopes: [...acceptedScopes],
    acceptedPermissions: { ...acceptedPermissions },
    repository: repository || '',
    permissionChecks: buildGitHubPermissionChecks({ permissions, scopes, acceptedPermissions }),
  };
}

module.exports = {
  authSnapshot,
  buildGitHubPermissionChecks,
  detectGitHubAuthType,
  githubWriteRequirement,
  parseGitHubHeaderList,
  parseGitHubPermissionHeader,
  repositoryFromEndpoint,
};
