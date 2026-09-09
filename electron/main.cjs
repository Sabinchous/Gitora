const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog } = require('electron');
const { clipboard } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const ignore = require('ignore');
const {
  githubErrorMessage,
  githubErrorCode,
  isAllowedGitHubDownloadUrl,
  isValidIssueNumber,
  isValidGitSha,
  isValidGitRef,
  isValidCommitLimit,
  isValidGitHubUsername,
  isValidInvitationId,
  isValidCollaboratorPermission,
  githubTeamState,
} = require('./githubErrors.cjs');
const { createMcpBridge } = require('./mcpBridge.cjs');
const {
  hasJsonMcpServer,
  hasTomlMcpServer,
  mcpServerDefinition,
  removeJsonMcpServer,
  removeTomlMcpServer,
  tomlTemplate,
  upsertJsonMcpServer,
  upsertTomlMcpServer,
  jsonTemplate,
} = require('./aiConfig.cjs');
const { fetchAllPages } = require('./githubPagination.cjs');
const {
  authSnapshot,
  detectGitHubAuthType,
  githubWriteRequirement,
  parseGitHubHeaderList,
  parseGitHubPermissionHeader,
  repositoryFromEndpoint,
} = require('./githubAuth.cjs');
const { createRepositoryFile, isEmptyRepository } = require('../mcpRepository.cjs');
const {
  giteaApiOrigin,
  giteaHeaders,
  giteaOrigin,
  giteaRequestPage,
  normalizeGiteaBaseUrl,
} = require('./gitea.cjs');
const accountsStore = require('./gitAccounts.cjs');
const commitSessions = require('./commitSessions.cjs');

const isDev = process.argv.includes('--dev');
const isMcpServer = process.argv.includes('--mcp-server');
const GITHUB_ORIGIN = 'https://github.com';
const API_ORIGIN = 'https://api.github.com';
const GITORA_REPOSITORY = 'Sabinchous/Gitora';
const REPO_PART = /^[A-Za-z0-9_.-]+$/;
const TEMPLATE_PART = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;
const execFileAsync = promisify(execFile);

let mainWindow;
let githubToken = null;
let githubTokenSource = 'none';
// Active git provider: 'github' (api.github.com) or 'gitea' ({baseUrl}/api/v1).
// All `github*` request helpers below route through the active provider, so
// every IPC handler keeps working while Gitea responses are normalized to the
// GitHub-shaped models the renderer expects (see electron/gitea.cjs).
let gitProvider = 'github';
let giteaBaseUrl = '';
// Multi-account session: { activeId, accounts:[{id, provider, baseUrl, token, login}]}.
// The githubToken/gitProvider/giteaBaseUrl globals always mirror the ACTIVE
// account, so every existing request helper works unchanged.
const githubAuthState = authSnapshot();
const userProfileCache = new Map();
let mcpBridge = null;
let mcpBridgeStartPromise = null;
let mcpMetadataPath = '';
let mcpBridgeConnections = 0;
let mcpLastError = '';
let mcpLastSuccessfulRequest = '';
let mcpWriteExpiresAt = 0;
let mcpWriteDuration = null;
const mcpActivityLog = [];
const mcpClientHeartbeats = new Map();
let lastMcpConfigLogKey = '';
let lastMcpClientLogKey = '';
let mcpLogQueue = Promise.resolve();
let isQuitting = false;
const MCP_CLIENT_HEARTBEAT_TTL_MS = 15000;
const MCP_WRITE_APPROVAL_TTLS_MS = Object.freeze({
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
});
const MCP_WRITE_DURATIONS = new Set([...Object.keys(MCP_WRITE_APPROVAL_TTLS_MS), 'forever']);
const MCP_BRIDGE_HEALTH_ENDPOINT = '/__gitora__/health';
const MCP_SERVER_PATH = path.resolve(__dirname, '../mcp-server.cjs');
const MCP_CLIENT_IDS = ['claude', 'cursor', 'codex'];
const MCP_TOOLS = [
  { name: 'list_repos', label: 'Список репозиториев', description: 'Показывает доступные GitHub-репозитории.', readOnly: true },
  { name: 'get_commits', label: 'История коммитов', description: 'Возвращает коммиты выбранного репозитория.', readOnly: true },
  { name: 'get_branches', label: 'Ветки', description: 'Показывает ветки и их последние коммиты.', readOnly: true },
  { name: 'get_commit_detail', label: 'Детали коммита', description: 'Показывает файлы, additions и deletions.', readOnly: true },
  { name: 'search_commits', label: 'Поиск коммитов', description: 'Ищет коммиты по сообщению или автору.', readOnly: true },
  { name: 'create_repo_file', label: 'Первый файл репозитория', description: 'Создаёт файл и первый commit в пустом репозитории.', readOnly: false },
  { name: 'create_issue', label: 'Создать Issue', description: 'Создаёт Issue в репозитории.', readOnly: false },
  { name: 'add_issue_comment', label: 'Комментарий к Issue/PR', description: 'Добавляет комментарий к Issue или Pull Request.', readOnly: false },
  { name: 'create_pull_request', label: 'Создать Pull Request', description: 'Создаёт Pull Request в репозитории.', readOnly: false },
  { name: 'get_git_commit_object', label: 'Git-объект commit', description: 'Читает raw commit object и SHA дерева.', readOnly: true },
  { name: 'create_git_blob', label: 'Git blob', description: 'Создаёт объект содержимого файла.', readOnly: false },
  { name: 'create_git_tree', label: 'Git tree', description: 'Создаёт дерево файлов.', readOnly: false },
  { name: 'create_git_commit', label: 'Git commit', description: 'Создаёт commit в репозитории.', readOnly: false },
  { name: 'create_git_branch', label: 'Создать ветку', description: 'Создаёт ветку от SHA коммита.', readOnly: false },
  { name: 'update_git_branch', label: 'Переместить ветку', description: 'Перемещает ветку на другой SHA без force push.', readOnly: false },
];

const AI_CLIENT_LABELS = {
  codex: 'Codex',
  chatgpt: 'ChatGPT',
  claude: 'Claude Desktop',
  cursor: 'Cursor',
  other: 'Другой MCP-клиент',
  manual: 'MCP-клиент',
};

function mcpLogPath() {
  try {
    return path.join(mcpMetadataPath ? path.dirname(mcpMetadataPath) : app.getPath('userData'), 'mcp-lifecycle.log');
  } catch {
    return '';
  }
}

function mcpLog(event, details = {}) {
  const entry = {
    at: new Date().toISOString(),
    process: 'gitora-main',
    event,
    ...details,
  };
  const line = `${JSON.stringify(entry)}\n`;
  const humanLabels = {
    mcp_bridge_starting: 'Starting bridge',
    mcp_bridge_started: 'Connected',
    mcp_bridge_start_failed: 'Connection lost',
    mcp_request_received: 'Request received',
    mcp_request: 'Request completed',
    mcp_request_failed: 'Request completed',
    mcp_client_heartbeat: 'Heartbeat OK',
    mcp_client_heartbeat_failed: 'Connection lost',
    mcp_client_reconnecting: 'Reconnecting',
    mcp_bridge_stopped: 'Session closed',
  };
  if (humanLabels[event]) console.error(`[MCP] ${humanLabels[event]}`, event === 'mcp_bridge_started' && details.sessionId ? details.sessionId : '');
  console.error(`[Gitora MCP] ${event}`, JSON.stringify(details));
  const logPath = mcpLogPath();
  if (logPath) {
    mcpLogQueue = mcpLogQueue
      .then(() => fs.appendFile(logPath, line, { encoding: 'utf8' }))
      .catch(() => {});
  }
  return mcpLogQueue;
}

function githubAuthLog(overrides = {}) {
  const snapshot = {
    ...authSnapshot({
      ...githubAuthState,
      tokenSource: githubTokenSource,
    }),
    ...overrides,
  };
  console.error('[GitHub Auth] User:', snapshot.user || '—');
  console.error('[GitHub Auth] Auth type:', snapshot.authType || 'None');
  console.error('[GitHub Auth] Token source:', snapshot.tokenSource || 'none');
  console.error('[GitHub Auth] Permissions:', JSON.stringify({
    repository: snapshot.permissions || {},
    accepted: snapshot.acceptedPermissions || {},
  }));
  console.error('[GitHub Auth] Scopes:', JSON.stringify(snapshot.scopes || []));
  void mcpLog('github_auth', snapshot);
  return snapshot;
}

function githubWriteLog({ repository = '', action = '', requiredPermission = '', result = '', status, errorCode } = {}) {
  const details = {
    repository: repository || '—',
    action: action || '—',
    requiredPermission: requiredPermission || '—',
    result: result || '—',
    ...(status ? { status } : {}),
    ...(errorCode ? { errorCode } : {}),
  };
  console.error('[GitHub Write] Repository:', details.repository);
  console.error('[GitHub Write] Action:', details.action);
  console.error('[GitHub Write] Required permission:', details.requiredPermission);
  console.error('[GitHub Write] Result:', details.result);
  void mcpLog('github_write', details);
  return details;
}

function mcpSessionLog({ sessionId = '', created = '', active = false, disconnected = '' } = {}) {
  const details = {
    sessionId: sessionId || '—',
    created: created || '—',
    active: Boolean(active),
    disconnected: disconnected || '—',
  };
  console.error('[MCP Session] Session ID:', details.sessionId);
  console.error('[MCP Session] Created:', details.created);
  console.error('[MCP Session] Active:', details.active);
  console.error('[MCP Session] Disconnected:', details.disconnected);
  void mcpLog('mcp_session_state', details);
  return details;
}

function mcpConfigLog({ configPath = '', loaded = false, server = '' } = {}) {
  const details = {
    configPath: configPath || '—',
    loaded: Boolean(loaded),
    server: server || '—',
  };
  const key = JSON.stringify(details);
  if (key === lastMcpConfigLogKey) return details;
  lastMcpConfigLogKey = key;
  console.error('[MCP Config] Config path:', details.configPath);
  console.error('[MCP Config] Loaded:', details.loaded);
  console.error('[MCP Config] Server:', details.server);
  void mcpLog('mcp_config', details);
  return details;
}

function mcpStartupLog({ started = false, pid = 0, toolsLoaded = 0 } = {}) {
  const details = { started: Boolean(started), pid: Number(pid) || 0, toolsLoaded: Number(toolsLoaded) || 0 };
  console.error('[MCP Startup] Started:', details.started);
  console.error('[MCP Startup] PID:', details.pid || '—');
  console.error('[MCP Startup] Tools loaded:', details.toolsLoaded);
  void mcpLog('mcp_startup', details);
  return details;
}

function mcpClientLog({ connected = false, session = '' } = {}) {
  const details = { connected: Boolean(connected), session: session || '—' };
  const key = JSON.stringify(details);
  if (key === lastMcpClientLogKey) return details;
  lastMcpClientLogKey = key;
  console.error('[MCP Client] Connected:', details.connected);
  console.error('[MCP Client] Session:', details.session);
  void mcpLog('mcp_client_state', details);
  return details;
}

function isMcpWriteAllowed() {
  if (mcpWriteExpiresAt === Number.POSITIVE_INFINITY) return true;
  if (mcpWriteExpiresAt <= Date.now()) {
    mcpWriteExpiresAt = 0;
    mcpWriteDuration = null;
    return false;
  }
  return true;
}

function mcpWriteStatus() {
  const allowed = isMcpWriteAllowed();
  return {
    mcpWritesAllowed: allowed,
    ...(allowed && mcpWriteDuration ? { mcpWritesDuration: mcpWriteDuration } : {}),
    ...(Number.isFinite(mcpWriteExpiresAt) && mcpWriteExpiresAt > 0
      ? { mcpWritesExpiresAt: new Date(mcpWriteExpiresAt).toISOString() }
      : {}),
  };
}

function revokeMcpWrites() {
  mcpWriteExpiresAt = 0;
  mcpWriteDuration = null;
  return mcpWriteStatus();
}

function aiClientConfigPath(client) {
  const appData = app.getPath('appData');
  if (client === 'claude') return path.join(appData, 'Claude', 'claude_desktop_config.json');
  if (client === 'cursor') return path.join(appData, 'Cursor', 'User', 'globalStorage', 'mcp.json');
  if (client === 'codex') return path.join(app.getPath('home'), '.codex', 'config.toml');
  return '';
}

function aiClientSupported(client) {
  return MCP_CLIENT_IDS.includes(client);
}

function mcpLaunchDefinition(client = 'manual') {
  const command = process.execPath;
  const metadataPath = mcpMetadataPath || path.join(app.getPath('userData'), 'mcp-bridge.json');
  const metadataArgument = `--bridge-metadata=${metadataPath}`;
  const args = [MCP_SERVER_PATH, `--client=${client}`, metadataArgument];
  return mcpServerDefinition(command, args, { ELECTRON_RUN_AS_NODE: '1' });
}

function aiConfigTemplate(client = 'manual') {
  const server = mcpLaunchDefinition(client);
  return client === 'codex' ? tomlTemplate(server) : jsonTemplate(server);
}

function mapMcpTool(endpoint) {
  if (endpoint === '/user/repos') return 'list_repos';
  if (endpoint.endsWith('/issues')) return 'create_issue';
  if (endpoint.includes('/issues/') && endpoint.endsWith('/comments')) return 'add_issue_comment';
  if (endpoint.endsWith('/pulls')) return 'create_pull_request';
  if (endpoint.includes('/commits/') && endpoint.split('/').length > 4) return 'get_commit_detail';
  if (endpoint.includes('/commits')) return 'get_commits';
  if (endpoint.includes('/branches')) return 'get_branches';
  return 'MCP bridge';
}

function recordMcpActivity({ endpoint, success, durationMs, error, client }) {
  const normalizedClient = client ? String(client) : '';
  if (endpoint === MCP_BRIDGE_HEALTH_ENDPOINT) {
    if (success && normalizedClient) {
      mcpClientHeartbeats.set(normalizedClient, Date.now());
      void markAiClientConnected(normalizedClient);
    }
    if (normalizedClient) {
      mcpClientLog({
        connected: success,
        session: mcpBridge?.metadata?.sessionId || '',
      });
    }
    mcpLog(success ? 'mcp_client_heartbeat' : 'mcp_client_heartbeat_failed', {
      client: normalizedClient || undefined,
      durationMs: Math.max(0, Number(durationMs) || 0),
      ...(error ? { error: String(error).slice(0, 180) } : {}),
    });
    return;
  }
  const repoMatch = endpoint.match(/^\/repos\/([^/]+)\/([^/]+)/);
  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    tool: mapMcpTool(endpoint),
    repository: repoMatch ? `${repoMatch[1]}/${repoMatch[2]}` : endpoint === '/user/repos' ? 'GitHub' : '—',
    success,
    durationMs: Math.max(0, Number(durationMs) || 0),
    ...(client ? { client: String(client) } : {}),
    ...(error ? { error: String(error).slice(0, 180) } : {}),
  };
  mcpActivityLog.unshift(entry);
  if (mcpActivityLog.length > 12) mcpActivityLog.length = 12;
  if (success) {
    mcpLastSuccessfulRequest = entry.at;
    if (normalizedClient) {
      mcpClientHeartbeats.set(normalizedClient, Date.now());
      void markAiClientConnected(normalizedClient);
    }
  }
  else mcpLastError = entry.error || 'MCP-запрос завершился ошибкой';
  mcpLog(success ? 'mcp_request' : 'mcp_request_failed', {
    tool: entry.tool,
    endpoint,
    client: normalizedClient || undefined,
    durationMs: entry.durationMs,
    ...(error ? { error: String(error).slice(0, 180) } : {}),
  });
}

async function markAiClientConnected(client) {
  if (![...MCP_CLIENT_IDS, 'manual'].includes(client)) return;
  const setup = await readAiSetup();
  const clientSetup = setup.clients?.[client];
  if (!clientSetup) return;
  if (setup.activeClient === client && !clientSetup.requiresRestart) return;
  await writeAiSetup({
    ...setup,
    activeClient: client,
    clients: {
      ...setup.clients,
      [client]: { ...clientSetup, requiresRestart: false },
    },
  });
  mcpLog('mcp_client_connected', { client });
}

function tokenPath() {
  return path.join(app.getPath('userData'), 'github-session');
}

// Session payload: JSON { provider, baseUrl, token }. Legacy plain-token
// files (GitHub only) are still accepted on restore and migrate on next save.
function serializeSession(token) {
  return JSON.stringify({ provider: gitProvider, baseUrl: giteaBaseUrl, token });
}

function deserializeSession(decrypted) {
  const value = typeof decrypted === 'string' ? decrypted : '';
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.token === 'string' && parsed.token) {
      gitProvider = parsed.provider === 'gitea' ? 'gitea' : 'github';
      giteaBaseUrl = typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '';
      if (gitProvider === 'github') giteaBaseUrl = '';
      return parsed.token;
    }
  } catch {
    // Legacy plain-token session below.
  }
  gitProvider = 'github';
  giteaBaseUrl = '';
  return value || null;
}

function providerInfo() {
  return { provider: gitProvider, baseUrl: gitProvider === 'gitea' ? giteaBaseUrl : '' };
}

// Login input: legacy GitHub token string, or
// { provider: 'github', token } / { provider: 'gitea', token, baseUrl }.
function parseLoginInput(input) {
  if (typeof input === 'string') {
    const cleanToken = input.trim();
    if (!cleanToken) throw new Error('Введите GitHub-токен');
    return { provider: 'github', baseUrl: '', token: cleanToken };
  }
  const data = input && typeof input === 'object' ? input : {};
  if (data.provider === 'gitea') {
    const { baseUrl } = normalizeGiteaBaseUrl(data.baseUrl);
    const cleanToken = typeof data.token === 'string' ? data.token.trim() : '';
    if (!cleanToken) throw new Error('Вставьте токен доступа Gitea');
    return { provider: 'gitea', baseUrl, token: cleanToken };
  }
  const cleanToken = typeof data.token === 'string' ? data.token.trim() : '';
  if (!cleanToken) throw new Error('Введите GitHub-токен');
  return { provider: 'github', baseUrl: '', token: cleanToken };
}

function activeApiOrigin() {
  return gitProvider === 'gitea' ? giteaApiOrigin(giteaBaseUrl) : API_ORIGIN;
}

function authHeaders(token = githubToken) {
  if (gitProvider === 'gitea') return giteaHeaders(token);
  return githubHeaders(token);
}

let gitSession = { activeId: '', accounts: [] };

async function persistSession() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Р—Р°С‰РёС‰С‘РЅРЅРѕРµ С…СЂР°РЅРёР»РёС‰Рµ РћРЎ РЅРµРґРѕСЃС‚СѓРїРЅРѕ');
  }
  const encrypted = safeStorage.encryptString(accountsStore.serializeSession(gitSession)).toString('base64');
  await fs.writeFile(tokenPath(), encrypted, { encoding: 'utf8', mode: 0o600 });
}

async function restoreToken() {
  try {
    const encrypted = await fs.readFile(tokenPath(), 'utf8');
    gitSession = accountsStore.deserializeSession(safeStorage.decryptString(Buffer.from(encrypted, 'base64')));
    return accountsStore.findAccount(gitSession, gitSession.activeId);
  } catch {
    gitSession = { activeId: '', accounts: [] };
    gitProvider = 'github';
    giteaBaseUrl = '';
    return null;
  }
}

async function clearToken() {
  githubToken = null;
  githubTokenSource = 'none';
  gitSession = { activeId: '', accounts: [] };
  gitProvider = 'github';
  giteaBaseUrl = '';
  userProfileCache.clear();
  revokeMcpWrites();
  Object.assign(githubAuthState, authSnapshot());
  await fs.rm(tokenPath(), { force: true });
}

// Point the active globals at the given account (tokens stay in gitSession).
function activateAccount(id, source) {
  const account = accountsStore.findAccount(gitSession, id);
  if (!account) return null;
  gitSession.activeId = account.id;
  githubToken = account.token;
  gitProvider = account.provider;
  giteaBaseUrl = account.baseUrl;
  githubTokenSource = source;
  userProfileCache.clear();
  return account;
}

// Insert or refresh an account by (provider, baseUrl, login).
function upsertAccount({ provider, baseUrl, token, login }) {
  const sameIdentity = (candidate) => candidate.provider === provider
    && candidate.baseUrl === (provider === 'gitea' ? baseUrl : '')
    && candidate.login.toLowerCase() === String(login || '').toLowerCase();
  const existing = gitSession.accounts.find(sameIdentity);
  if (existing) {
    existing.token = token;
    existing.login = login;
    return existing;
  }
  const account = accountsStore.normalizeAccount({ provider, baseUrl, token, login });
  gitSession.accounts.push(account);
  return account;
}

// Remove one account; if it was active, fall through to the next one.
// Returns { account, user } for the newly active account (user=null if none).
async function removeAccountById(id) {
  const target = accountsStore.findAccount(gitSession, id);
  if (!target) throw new Error('Аккаунт не найден');
  gitSession.accounts = gitSession.accounts.filter(account => account.id !== target.id);
  if (gitSession.activeId !== target.id) {
    await persistSession();
    const active = accountsStore.findAccount(gitSession, gitSession.activeId);
    return { account: active, user: null };
  }
  const next = gitSession.accounts[0] || null;
  if (!next) {
    await clearToken();
    return { account: null, user: null };
  }
  activateAccount(next.id, 'switched');
  const user = await githubRequest('/user');
  githubAuthState.user = user.login || '';
  githubAuthState.authType = gitProvider === 'gitea' ? 'Gitea token' : detectGitHubAuthType(githubToken);
  githubAuthState.tokenSource = githubTokenSource;
  await persistSession();
  return { account: next, user };
}

function snapshotWithUser(user) {
  return { ...user, ...providerInfo(), ...accountsStore.snapshot(gitSession) };
}

// --- Commit sessions (Phase 1) --------------------------------------------
// In-memory registry; closing the sandbox wipes the VM, the host removes the
// temp dir on stop/liveness refresh. Tokens never enter the VM: only the
// downloaded commit archive is mapped in.
const commitSessionRegistry = new Map();

function sessionsRootDir() {
  return commitSessions.sessionsRoot(app.getPath('temp'));
}

function publicSession(entry) {
  return {
    id: entry.id,
    owner: entry.owner,
    repo: entry.repo,
    sha: entry.sha,
    launchFile: entry.launchFile,
    state: entry.state,
    createdAt: entry.createdAt,
  };
}

async function removeSessionDir(dir) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {}
}

function refreshSessionLiveness(entry) {
  if ((entry.state === 'running' || entry.state === 'starting') && !commitSessions.isAlive(entry.pid)) {
    entry.state = 'gone';
    void removeSessionDir(entry.dir);
    commitSessionRegistry.delete(entry.id);
    return false;
  }
  return true;
}

function liveSessions() {
  for (const entry of [...commitSessionRegistry.values()]) refreshSessionLiveness(entry);
  return [...commitSessionRegistry.values()];
}

function commitArchiveRequest(owner, repo, sha) {
  const url = gitProvider === 'gitea'
    ? `${giteaBaseUrl}/${owner}/${repo}/archive/${sha}.zip`
    : `${GITHUB_ORIGIN}/${owner}/${repo}/archive/${sha}.zip`;
  const headers = githubToken
    ? (gitProvider === 'gitea' ? giteaHeaders(githubToken) : { Authorization: `Bearer ${githubToken}` })
    : {};
  return { url, headers };
}

function githubHeaders(token = githubToken) {
  if (!token) throw new Error('GitHub РЅРµ РїРѕРґРєР»СЋС‡С‘РЅ');
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'Gitora-App',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function githubRequestPage(endpoint, options = {}, token = githubToken) {
  if (gitProvider === 'gitea') {
    return giteaRequestPage({ apiOrigin: giteaApiOrigin(giteaBaseUrl), token, githubEndpoint: endpoint, options });
  }
  if (token && githubAuthState.authType === 'None') {
    githubAuthState.authType = detectGitHubAuthType(token);
    githubAuthState.tokenSource = githubTokenSource;
  }
  const method = String(options.method || 'GET').toUpperCase();
  const repository = repositoryFromEndpoint(endpoint);
  const requiredPermission = githubWriteRequirement(method, endpoint);
  if (requiredPermission) {
    githubWriteLog({ repository, action: `${method} ${endpoint}`, requiredPermission, result: 'started' });
  }
  let response;
  try {
    const url = new URL(endpoint, API_ORIGIN);
    if (url.origin !== API_ORIGIN) throw new Error('Недопустимый адрес GitHub API');
    response = await fetch(url, {
      ...options,
      headers: {
        ...githubHeaders(token),
        ...options.headers,
      },
    });
  } catch {
    const error = new Error('Нет подключения к интернету.');
    error.code = 'network';
    if (requiredPermission) {
      githubWriteLog({ repository, action: `${method} ${endpoint}`, requiredPermission, result: error.message, errorCode: error.code });
    }
    throw error;
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  const scopes = parseGitHubHeaderList(response.headers.get('x-oauth-scopes'));
  const acceptedScopes = parseGitHubHeaderList(response.headers.get('x-accepted-oauth-scopes'));
  const acceptedPermissions = parseGitHubPermissionHeader(response.headers.get('x-accepted-github-permissions'));
  if (scopes.length || acceptedScopes.length) {
    githubAuthState.scopes = scopes;
    githubAuthState.acceptedScopes = acceptedScopes;
  }
  if (Object.keys(acceptedPermissions).length > 0) {
    githubAuthState.acceptedPermissions = acceptedPermissions;
  }
  if (endpoint === '/user' && response.ok && data?.login) {
    githubAuthState.user = data.login;
    githubAuthState.authType = detectGitHubAuthType(token);
    githubAuthState.tokenSource = githubTokenSource;
    githubAuthLog();
  }
  if (response.ok && repository && endpoint === `/repos/${repository}` && data?.permissions) {
    githubAuthState.repository = repository;
    githubAuthState.permissions = { ...data.permissions };
    githubAuthLog();
  }
  if (response.ok) {
    if (requiredPermission) {
      githubWriteLog({ repository, action: `${method} ${endpoint}`, requiredPermission, result: 'success', status: response.status });
    }
    return {
      data,
      status: response.status,
      link: response.headers.get('link') || '',
      rateLimitRemaining: response.headers.get('x-ratelimit-remaining') || '',
      rateLimitLimit: response.headers.get('x-ratelimit-limit') || '',
      oauthScopes: response.headers.get('x-oauth-scopes') || '',
    };
  }

  const remaining = response.headers.get('x-ratelimit-remaining');
  if (response.status === 403 && remaining === '0') {
    const error = new Error('GitHub временно ограничил запросы. Попробуйте позже.');
    error.code = 'github';
    error.status = response.status;
    if (requiredPermission) {
      githubWriteLog({ repository, action: `${method} ${endpoint}`, requiredPermission, result: error.message, status: response.status, errorCode: error.code });
    }
    throw error;
  }
  const baseErrorMessage = githubErrorMessage(response.status, data?.message, endpoint, options.method || 'GET');
  const permissionHint = response.status === 403 && requiredPermission
    ? ` Required permission for this operation: ${requiredPermission}.`
    : '';
  const error = new Error(`${baseErrorMessage}${permissionHint}`);
  error.code = githubErrorCode(response.status, data?.message, endpoint);
  error.status = response.status;
  if (requiredPermission) {
    error.requiredPermission = requiredPermission;
    githubWriteLog({ repository, action: `${method} ${endpoint}`, requiredPermission, result: error.message, status: response.status, errorCode: error.code });
  }
  throw error;
}

async function githubRequest(endpoint, options = {}, token = githubToken) {
  const page = await githubRequestPage(endpoint, options, token);
  return page.data;
}

async function publicGitHubRequest(endpoint) {
  let url;
  try {
    url = new URL(endpoint, API_ORIGIN);
    if (url.origin !== API_ORIGIN) throw new Error('Недопустимый адрес GitHub API');
  } catch {
    throw new Error('Недопустимый адрес GitHub API');
  }

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Gitora-App',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch {
    const error = new Error('Нет подключения к интернету.');
    error.code = 'network';
    throw error;
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.ok) return data;

  const error = new Error(githubErrorMessage(response.status, data?.message, endpoint, 'GET'));
  error.code = githubErrorCode(response.status, data?.message, endpoint);
  error.status = response.status;
  throw error;
}

async function githubRequestAll(endpoint, options = {}, token = githubToken) {
  return fetchAllPages(
    endpoint,
    nextEndpoint => githubRequestPage(nextEndpoint, options, token),
    {
      apiOrigin: activeApiOrigin(),
      onPage: page => mcpLog('github_page_fetched', {
        endpoint: page.endpoint,
        page: page.page,
        itemCount: page.itemCount,
        hasNext: page.hasNext,
        rateLimitRemaining: page.rateLimitRemaining || undefined,
        rateLimitLimit: page.rateLimitLimit || undefined,
      }),
    },
  );
}

function shouldFetchAllPages(endpoint) {
  const url = new URL(endpoint, API_ORIGIN);
  return url.origin === API_ORIGIN
    && (url.pathname === '/user/repos' || url.pathname.endsWith('/branches'));
}

function validRepo(owner, repo) {
  return REPO_PART.test(owner) && REPO_PART.test(repo);
}

function teamRepositoryEndpoint(owner, repo, suffix = '') {
  if (!validRepo(owner, repo)) throw new Error('Некорректное имя репозитория');
  return `/repos/${owner}/${repo}${suffix}`;
}

async function githubTeamList(endpoint) {
  const data = await githubRequestAll(endpoint);
  const items = Array.isArray(data) ? data : [];
  return { state: githubTeamState(Array.isArray(data) ? 200 : 204, items), items };
}

async function githubContributorStats(endpoint) {
  try {
    const page = await githubRequestPage(endpoint);
    const items = Array.isArray(page.data) ? page.data : [];
    return { state: githubTeamState(page.status, items), items };
  } catch (error) {
    if (error?.status === 202) return { state: 'pending', items: [] };
    throw error;
  }
}

function collaboratorMutationPayload(permission) {
  if (!isValidCollaboratorPermission(permission)) throw new Error('Некорректная роль участника');
  return JSON.stringify({ permission });
}

async function mutateCollaborator(owner, repo, login, permission) {
  if (!isValidGitHubUsername(login)) throw new Error('Некорректное имя пользователя GitHub');
  const page = await githubRequestPage(teamRepositoryEndpoint(owner, repo, `/collaborators/${encodeURIComponent(login)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: collaboratorMutationPayload(permission),
  });
  return { status: page.status === 201 ? 201 : 204 };
}

function refPath(branch) {
  return String(branch).split('/').map(encodeURIComponent).join('/');
}

function mapRelease(release) {
  return {
    tag: release.tag_name,
    name: release.name,
    body: release.body,
    publishedAt: release.published_at || release.created_at,
    prerelease: release.prerelease,
    assets: release.assets.map(asset => ({
      name: asset.name,
      size: asset.size,
      downloadUrl: asset.browser_download_url,
      downloadCount: asset.download_count,
    })),
  };
}

function mergeGitHubCommits(...histories) {
  const commits = new Map();
  for (const history of histories) {
    if (!Array.isArray(history)) continue;
    for (const commit of history) {
      if (commit?.sha && !commits.has(commit.sha)) commits.set(commit.sha, commit);
    }
  }
  return [...commits.values()];
}

function result(handler) {
  return async (...args) => {
    try {
      return { success: true, data: await handler(...args) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        ...(error?.code ? { errorCode: error.code } : {}),
        ...(error?.requiredPermission ? { requiredPermission: error.requiredPermission } : {}),
        ...(error?.status ? { status: error.status } : {}),
      };
    }
  };
}

function isAllowedExternal(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (url.origin === GITHUB_ORIGIN) return true;
    // Installed Gitea instance of the current session (https, or http for
    // local test servers).
    if (gitProvider === 'gitea' && giteaBaseUrl && url.origin === giteaOrigin(giteaBaseUrl)) return true;
    return false;
  } catch {
    return false;
  }
}

async function fetchAllowedGitHubDownload(rawUrl) {
  let currentUrl = rawUrl;

  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const response = await fetch(currentUrl, { redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;

    const location = response.headers.get('location');
    if (!location) throw new Error('Ссылка на release asset содержит неполный редирект');

    const nextUrl = new URL(location, currentUrl).toString();
    if (!isAllowedGitHubDownloadUrl(nextUrl)) {
      throw new Error('Ссылка перенаправила на запрещённый адрес');
    }
    currentUrl = nextUrl;
  }

  throw new Error('Слишком много перенаправлений при скачивании release asset');
}

function isAllowedNavigation(rawUrl) {
  if (!isDev) return false;
  try {
    return new URL(rawUrl).origin === 'http://localhost:5173';
  } catch {
    return false;
  }
}

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_TOTAL_SIZE = 1024 * 1024 * 1024;
const ALWAYS_EXCLUDED = new Set(['.git', 'node_modules', '.DS_Store', 'Thumbs.db']);
const EXCLUDED_PATTERNS = ['.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx'];

let selectedUploadFolder = null;

function gitExecutables() {
  const configured = typeof process.env.GITORA_GIT_PATH === 'string' ? process.env.GITORA_GIT_PATH.trim() : '';
  return [
    configured,
    'git',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Git', 'cmd', 'git.exe') : '',
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'Git', 'cmd', 'git.exe') : '',
  ].filter(Boolean);
}

async function runGit(folderPath, args) {
  let lastError;
  for (const executable of gitExecutables()) {
    try {
      return await execFileAsync(executable, ['-C', folderPath, ...args], {
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        encoding: 'utf8',
      });
    } catch (error) {
      lastError = error;
      if (error?.code !== 'ENOENT') {
        const message = String(error?.stderr || error?.stdout || error?.message || '').trim();
        throw new Error(message || 'Команда Git завершилась с ошибкой');
      }
    }
  }
  throw new Error(lastError?.code === 'ENOENT'
    ? 'Git не найден. Установите Git и перезапустите Gitora.'
    : 'Не удалось запустить Git');
}

async function validateGitFolder(folderPath) {
  const cleanPath = typeof folderPath === 'string' ? folderPath.trim() : '';
  if (!cleanPath || !path.isAbsolute(cleanPath)) throw new Error('Некорректный путь локальной папки');
  const stat = await fs.stat(cleanPath);
  if (!stat.isDirectory()) throw new Error('Выбранный путь не является папкой');
  return cleanPath;
}

function parseGitStatus(output) {
  return output.split(/\r?\n/).filter(Boolean).map(line => {
    const status = line.slice(0, 2);
    const rawPath = line.slice(3).trim();
    const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() : rawPath;
    return {
      path: filePath,
      status: status.includes('D') ? 'deleted' : status.includes('A') || status === '??' ? 'added' : 'modified',
    };
  });
}

function parseGitNumstat(output) {
  return output.split(/\r?\n/).filter(Boolean).reduce((totals, line) => {
    const [additions, deletions] = line.split('\t');
    const parseCount = value => /^\d+$/.test(value || '') ? Number(value) : 0;
    return { additions: totals.additions + parseCount(additions), deletions: totals.deletions + parseCount(deletions) };
  }, { additions: 0, deletions: 0 });
}

async function buildGitFolderChanges(folderPath, targetBranch) {
  const cleanPath = await validateGitFolder(folderPath);
  const branchResult = await runGit(cleanPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const currentBranch = String(branchResult.stdout || '').trim();
  if (!currentBranch || currentBranch === 'HEAD') throw new Error('Папка находится в detached HEAD; выберите обычную ветку');
  const statusResult = await runGit(cleanPath, ['status', '--porcelain=v1']);
  const changes = parseGitStatus(statusResult.stdout);
  const [unstaged, staged] = await Promise.all([
    runGit(cleanPath, ['diff', '--numstat']),
    runGit(cleanPath, ['diff', '--cached', '--numstat']),
  ]);
  const unstagedTotals = parseGitNumstat(unstaged.stdout);
  const stagedTotals = parseGitNumstat(staged.stdout);
  const cleanTarget = typeof targetBranch === 'string' && targetBranch.trim() ? targetBranch.trim() : currentBranch;
  if (!isValidGitRef(cleanTarget)) throw new Error('Некорректная ветка назначения');
  return {
    folderPath: cleanPath,
    branch: cleanTarget,
    targetBranch: cleanTarget,
    currentBranch,
    isGitRepository: true,
    warnings: changes.some(change => change.path.endsWith('.env') || change.path.endsWith('.key'))
      ? ['Проверьте, что в commit не попадут секреты.']
      : [],
    added: changes.filter(change => change.status === 'added').length,
    modified: changes.filter(change => change.status === 'modified').length,
    deleted: changes.filter(change => change.status === 'deleted').length,
    additions: unstagedTotals.additions + stagedTotals.additions,
    deletions: unstagedTotals.deletions + stagedTotals.deletions,
    changes: changes.slice(0, 200),
  };
}

async function readGitignore(dirPath) {
  const ig = ignore();
  try {
    const content = await fs.readFile(path.join(dirPath, '.gitignore'), 'utf8');
    ig.add(content.split('\n').filter(line => line.trim() && !line.startsWith('#')));
  } catch {}
  for (const pattern of EXCLUDED_PATTERNS) {
    ig.add(pattern);
  }
  return ig;
}

async function scanFolder(dirPath, ig, rootPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];
  const warnings = [];
  let totalBytes = 0;

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (ALWAYS_EXCLUDED.has(entry.name)) continue;
      if (ig.ignores(relativePath + '/') || ig.ignores(entry.name)) continue;

      try {
        const stat = await fs.lstat(fullPath);
        if (stat.isSymbolicLink()) {
          warnings.push(`Symlink РїСЂРѕРїСѓС‰РµРЅ: ${relativePath}`);
          continue;
        }
      } catch { continue; }

      const sub = await scanFolder(fullPath, ig, rootPath);
      files.push(...sub.files);
      totalBytes += sub.totalBytes;
      warnings.push(...sub.warnings);
    } else {
      if (ig.ignores(relativePath) || ig.ignores(entry.name)) continue;

      try {
        const stat = await fs.lstat(fullPath);
        if (stat.isSymbolicLink()) {
          warnings.push(`Symlink РїСЂРѕРїСѓС‰РµРЅ: ${relativePath}`);
          continue;
        }
        if (stat.size > MAX_FILE_SIZE) {
          warnings.push(`Р¤Р°Р№Р» >100 РњР‘ РїСЂРѕРїСѓС‰РµРЅ: ${relativePath}`);
          continue;
        }
        totalBytes += stat.size;
        if (totalBytes > MAX_TOTAL_SIZE) {
          warnings.push(`РћР±С‰РёР№ СЂР°Р·РјРµСЂ РїСЂРµРІС‹С€Р°РµС‚ 1 Р“Р‘`);
        }
        files.push({ relativePath, fullPath, size: stat.size });
      } catch { continue; }
    }
  }

  return { files, totalBytes, warnings };
}

async function scanUploadFolder(dirPath) {
  const ig = await readGitignore(dirPath);
  const { files, totalBytes, warnings } = await scanFolder(dirPath, ig, dirPath);
  return { path: dirPath, fileCount: files.length, totalBytes, warnings, files, ig };
}

function gitBlobSha(buffer) {
  return crypto
    .createHash('sha1')
    .update(Buffer.from(`blob ${buffer.length}\0`))
    .update(buffer)
    .digest('hex');
}

function isExcludedRepoPath(filePath, ig) {
  const parts = filePath.split('/');
  const basename = path.posix.basename(filePath);
  const secretIg = ignore().add(EXCLUDED_PATTERNS);
  return parts.some(part => ALWAYS_EXCLUDED.has(part))
    || secretIg.ignores(basename)
    || Boolean(ig?.ignores(filePath));
}

async function getBranchState(owner, repo, branch) {
  const ref = await githubRequest(`/repos/${owner}/${repo}/git/ref/heads/${refPath(branch)}`);
  const commit = await githubRequest(`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
  const tree = await githubRequest(`/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  return { headSha: ref.object.sha, treeSha: commit.tree.sha, tree };
}

function mapRemoteFiles(tree, ig) {
  const files = new Map();
  for (const item of tree.tree || []) {
    if (item.type === 'blob' && !isExcludedRepoPath(item.path, ig)) files.set(item.path, item);
  }
  return files;
}

async function buildFolderChanges(owner, repo, branch, folderPath) {
  const folderData = await scanUploadFolder(folderPath);
  const branchState = await getBranchState(owner, repo, branch);
  const remoteFiles = mapRemoteFiles(branchState.tree, folderData.ig);
  const localFiles = new Map();
  const changes = [];

  for (const file of folderData.files) {
    const content = await fs.readFile(file.fullPath);
    const sha = gitBlobSha(content);
    const remote = remoteFiles.get(file.relativePath);
    localFiles.set(file.relativePath, { ...file, content, sha });
    if (!remote) changes.push({ path: file.relativePath, status: 'added' });
    else if (remote.sha !== sha) changes.push({ path: file.relativePath, status: 'modified' });
  }

  for (const filePath of remoteFiles.keys()) {
    if (!localFiles.has(filePath)) changes.push({ path: filePath, status: 'deleted' });
  }

  return {
    folderPath,
    branch,
    warnings: folderData.warnings,
    files: localFiles,
    branchState,
    changes,
    added: changes.filter(change => change.status === 'added').length,
    modified: changes.filter(change => change.status === 'modified').length,
    deleted: changes.filter(change => change.status === 'deleted').length,
  };
}

async function commitTreeChanges(owner, repo, branch, baseTreeSha, parentSha, changes, localFiles, message) {
  const treeItems = [];
  for (const change of changes) {
    if (change.status === 'deleted') {
      treeItems.push({ path: change.path, mode: '100644', type: 'blob', sha: null });
      continue;
    }
    const file = localFiles.get(change.path);
    const blob = await githubRequest(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: file.content.toString('base64'),
        encoding: 'base64',
      }),
    });
    treeItems.push({ path: change.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const tree = await githubRequest(`/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  });
  const commit = await githubRequest(`/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
  });
  await githubRequest(`/repos/${owner}/${repo}/git/refs/heads/${refPath(branch)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit;
}

// --- Gitea file operations -------------------------------------------------
// Gitea has no GitHub-compatible git-database API (blobs/trees/commits), so
// file writes go through the contents API: one commit per file.

function giteaContentsPath(filePath) {
  return String(filePath).split('/').map(encodeURIComponent).join('/');
}

async function giteaContentsEntry(owner, repo, filePath, branch) {
  const params = branch ? `?ref=${encodeURIComponent(branch)}` : '';
  try {
    return await githubRequest(`/repos/${owner}/${repo}/contents/${giteaContentsPath(filePath)}${params}`);
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

function giteaBase64Equal(first, second) {
  return String(first || '').replace(/\s/g, '') === String(second || '').replace(/\s/g, '');
}

async function giteaCommitFile({ owner, repo, branch, relativePath, content, message }) {
  const base64 = Buffer.isBuffer(content) ? content.toString('base64') : Buffer.from(String(content || ''), 'utf8').toString('base64');
  const existing = await giteaContentsEntry(owner, repo, relativePath, branch);
  if (existing && existing.sha && giteaBase64Equal(existing.content, base64)) {
    return { sha: existing.sha, changed: false };
  }
  const file = await githubRequest(`/repos/${owner}/${repo}/contents/${giteaContentsPath(relativePath)}`, {
    method: existing && existing.sha ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: base64,
      branch,
      ...(existing && existing.sha ? { sha: existing.sha } : {}),
    }),
  });
  const sha = file?.commit?.sha || file?.content?.sha || existing?.sha || '';
  return { sha, changed: true };
}

async function uploadFolderToGiteaRepo(owner, repo, folderData, repository) {
  const { files } = folderData;
  if (files.length === 0) return { uploadedCount: 0, skippedCount: 0, uploadStatus: 'none' };
  const branch = repository?.default_branch || 'main';
  const MAX_GITEA_UPLOAD_FILES = 100;
  const batch = files.slice(0, MAX_GITEA_UPLOAD_FILES);
  let uploadedCount = 0;
  let skippedCount = files.length - batch.length;

  for (const file of batch) {
    try {
      const content = await fs.readFile(file.fullPath);
      await giteaCommitFile({
        owner,
        repo,
        branch,
        relativePath: file.relativePath,
        content,
        message: `Add ${file.relativePath}`,
      });
      uploadedCount += 1;
    } catch {
      skippedCount += 1;
    }
  }

  return {
    uploadedCount,
    skippedCount,
    uploadStatus: uploadedCount === 0 ? 'error' : (skippedCount > 0 ? 'partial' : 'success'),
  };
}

async function buildGiteaFolderChanges(owner, repo, branch, folderPath) {
  const folderData = await scanUploadFolder(folderPath);
  const changes = [];
  const files = new Map();
  const bounded = folderData.files.slice(0, 200);
  const warnings = [...folderData.warnings];
  if (folderData.files.length > bounded.length) {
    warnings.push(`Gitea: сверены первые ${bounded.length} из ${folderData.files.length} файлов`);
  }
  warnings.push('Gitea: удаления файлов на сервере не сверяются');

  for (const file of bounded) {
    const content = await fs.readFile(file.fullPath);
    files.set(file.relativePath, { ...file, content });
    const remote = await giteaContentsEntry(owner, repo, file.relativePath, branch);
    if (!remote) changes.push({ path: file.relativePath, status: 'added' });
    else if (remote.sha && !giteaBase64Equal(remote.content, content.toString('base64'))) {
      changes.push({ path: file.relativePath, status: 'modified' });
    }
  }

  return {
    folderPath,
    branch,
    warnings,
    files,
    changes,
    added: changes.filter(change => change.status === 'added').length,
    modified: changes.filter(change => change.status === 'modified').length,
    deleted: 0,
  };
}

async function commitGiteaFolderChanges(owner, repo, branch, data, message) {
  if (data.changes.length === 0) {
    const head = await githubRequest(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`);
    return { sha: head?.commit?.sha || '', changed: false, count: 0 };
  }
  let sha = '';
  let count = 0;
  for (const change of data.changes) {
    const file = data.files.get(change.path);
    if (!file) continue;
    const result = await giteaCommitFile({
      owner,
      repo,
      branch,
      relativePath: change.path,
      content: file.content,
      message,
    });
    if (result.changed) {
      count += 1;
      sha = result.sha || sha;
    }
  }
  return { sha, changed: count > 0, count };
}

async function resolveGiteaLabelIds(owner, repo, labels) {
  const names = Array.isArray(labels) ? labels.map(label => String(label || '').trim()).filter(Boolean) : [];
  if (names.length === 0) return undefined;
  try {
    const remote = await githubRequest(`/repos/${owner}/${repo}/labels`);
    const byName = new Map((Array.isArray(remote) ? remote : []).map(label => [String(label.name), label.id]));
    const ids = names.map(name => byName.get(name)).filter(id => id !== undefined);
    return ids.length > 0 ? ids : undefined;
  } catch {
    return undefined;
  }
}

async function renameGiteaBranch(owner, repo, branch, newName) {
  const source = await githubRequest(`/repos/${owner}/${repo}/branches/${refPath(branch)}`);
  const sha = source?.commit?.sha || '';
  await githubRequest(`/repos/${owner}/${repo}/branches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_branch_name: newName, old_ref_name: sha || branch }),
  });
  await githubRequest(`/repos/${owner}/${repo}/branches/${refPath(branch)}`, { method: 'DELETE' });
  return githubRequest(`/repos/${owner}/${repo}/branches/${refPath(newName)}`);
}

async function uploadGiteaReleaseAsset(owner, repo, release, assetPath) {
  // Gitea attaches assets via multipart POST, unlike GitHub's upload_url flow.
  const asset = await fs.readFile(assetPath);
  const fileName = path.basename(assetPath);
  const form = new FormData();
  form.set('attachment', new Blob([asset], { type: 'application/octet-stream' }), fileName);
  const url = new URL(
    `${giteaApiOrigin(giteaBaseUrl)}/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(fileName)}`,
  );
  const response = await fetch(url, {
    method: 'POST',
    headers: giteaHeaders(githubToken),
    body: form,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || 'Не удалось загрузить файл релиза в Gitea');
  }
  return mapRelease(await githubRequest(`/repos/${owner}/${repo}/releases/${release.id}`));
}

async function resolveDownloadPath(fileName, options = {}) {
  const safeFileName = path.basename(String(fileName || 'download'));

  if (options?.mode === 'ask') {
    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: 'Выберите, куда сохранить файл',
      defaultPath: path.join(app.getPath('downloads'), safeFileName),
    });
    if (saveResult.canceled || !saveResult.filePath) return null;
    return saveResult.filePath;
  }

  const directory = options?.mode === 'defaultFolder' && typeof options.directory === 'string' && options.directory.trim()
    ? options.directory.trim()
    : app.getPath('downloads');
  await fs.mkdir(directory, { recursive: true });
  return path.join(directory, safeFileName);
}

async function uploadFolderToRepo(owner, repo, folderData, repository) {
  const { files } = folderData;
  if (files.length === 0) return { uploadedCount: 0, skippedCount: 0, status: 'success' };
  const branch = repository?.default_branch || 'main';
  const branchState = repository?.default_branch
    ? await getBranchState(owner, repo, branch)
    : null;

  const blobShaMap = new Map();
  let uploadedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    try {
      const content = await fs.readFile(file.fullPath);
      const encoding = 'base64';
      const blob = await githubRequest(`/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.toString('base64'),
          encoding,
        }),
      });
      blobShaMap.set(file.relativePath, blob.sha);
      uploadedCount++;
    } catch {
      skippedCount++;
    }
  }

  const treeItems = [];
  for (const [filePath, sha] of blobShaMap) {
    treeItems.push({ path: filePath, mode: '100644', type: 'blob', sha });
  }

  if (treeItems.length === 0) {
    return { uploadedCount, skippedCount, status: 'error' };
  }

  const tree = await githubRequest(`/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(branchState?.treeSha ? { base_tree: branchState.treeSha } : {}),
      tree: treeItems,
    }),
  });

  const commit = await githubRequest(`/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Initial commit',
      tree: tree.sha,
      ...(branchState?.headSha ? { parents: [branchState.headSha] } : {}),
    }),
  });

  if (branchState?.headSha) {
    await githubRequest(`/repos/${owner}/${repo}/git/refs/heads/${refPath(branch)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } else {
    await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
  }

  const status = skippedCount > 0 ? 'partial' : 'success';
  return { uploadedCount, skippedCount, status };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 320,
    minHeight: 560,
    title: 'Gitora',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    backgroundColor: '#261732',
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault();
  });

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173');
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startMcpBridge() {
  if (mcpBridge?.isRunning?.()) return mcpBridge.metadata;
  if (mcpBridgeStartPromise) return mcpBridgeStartPromise;

  mcpBridgeStartPromise = (async () => {
    try {
      mcpMetadataPath = path.join(app.getPath('userData'), 'mcp-bridge.json');
      mcpLog('mcp_bridge_starting', { metadataPath: mcpMetadataPath, pid: process.pid });
      const nextBridge = createMcpBridge({
        metadataPath: mcpMetadataPath,
        onConnection: () => {
          mcpBridgeConnections += 1;
          mcpSessionLog({
            sessionId: nextBridge?.metadata?.sessionId,
            created: nextBridge?.metadata?.createdAt,
            active: true,
          });
        },
        onDisconnect: () => {
          mcpBridgeConnections = Math.max(0, mcpBridgeConnections - 1);
          mcpSessionLog({
            sessionId: nextBridge?.metadata?.sessionId,
            created: nextBridge?.metadata?.createdAt,
            active: mcpBridgeConnections > 0,
            disconnected: new Date().toISOString(),
          });
        },
        onRequestStart: ({ endpoint, client, requestId }) => mcpLog('mcp_request_received', {
          endpoint,
          client: client || undefined,
          requestId: requestId === undefined ? undefined : String(requestId),
        }),
        isWriteAllowed: () => isMcpWriteAllowed(),
        onRequest: recordMcpActivity,
        request: (endpoint, options = {}) => {
          const requestOptions = {
            method: options.method || 'GET',
            ...(options.body === undefined ? {} : {
              headers: { 'Content-Type': 'application/json' },
              body: options.body,
            }),
          };
          return shouldFetchAllPages(endpoint)
            ? githubRequestAll(endpoint, requestOptions)
            : githubRequest(endpoint, requestOptions);
        },
      });
      await nextBridge.start();
      mcpBridge = nextBridge;
      mcpLog('mcp_bridge_started', {
        socketPath: mcpBridge.metadata.socketPath,
        sessionId: mcpBridge.metadata.sessionId,
        createdAt: mcpBridge.metadata.createdAt,
      });
      mcpSessionLog({
        sessionId: mcpBridge.metadata.sessionId,
        created: mcpBridge.metadata.createdAt,
        active: true,
      });
      return mcpBridge.metadata;
    } catch (error) {
      mcpLastError = error instanceof Error ? error.message : 'MCP-мост не запустился';
      mcpLog('mcp_bridge_start_failed', { error: mcpLastError });
      console.error('MCP bridge unavailable:', error);
      return null;
    }
  })();

  try {
    return await mcpBridgeStartPromise;
  } finally {
    mcpBridgeStartPromise = null;
  }
}

const hasSingleInstanceLock = isMcpServer || app.requestSingleInstanceLock();

if (!isMcpServer && !hasSingleInstanceLock) {
  console.error('Gitora is already running; refusing to start a second main process.');
  app.quit();
} else if (isMcpServer) {
  require(MCP_SERVER_PATH);
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(async () => {
    mcpLog('gitora_start', { pid: process.pid, version: app.getVersion() });
    await restoreToken();
    createWindow();
    // MCP не должен блокировать создание окна и загрузку Gitora.
    void startMcpBridge();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', event => {
    if (isQuitting) return;
    event.preventDefault();
    isQuitting = true;
    revokeMcpWrites();
    mcpLog('gitora_shutdown_started', { pid: process.pid });
    void (async () => {
      try {
        await mcpBridge?.stop();
        if (mcpBridge?.metadata) {
          mcpSessionLog({
            sessionId: mcpBridge.metadata.sessionId,
            created: mcpBridge.metadata.createdAt,
            active: false,
            disconnected: new Date().toISOString(),
          });
        }
        mcpBridgeConnections = 0;
        mcpBridge = null;
        mcpLog('mcp_bridge_stopped');
      } catch (error) {
        mcpLog('mcp_bridge_stop_failed', { error: error instanceof Error ? error.message : 'Неизвестная ошибка' });
      } finally {
        await mcpLog('gitora_shutdown_complete');
        app.quit();
      }
    })();
  });
}

ipcMain.handle('github:login', result(async (_event, token) => {
  const session = parseLoginInput(token);
  // Verify the candidate on its own provider without dropping the current session.
  const previous = { provider: gitProvider, baseUrl: giteaBaseUrl, token: githubToken, source: githubTokenSource };
  gitProvider = session.provider;
  giteaBaseUrl = session.baseUrl;
  try {
    const user = await githubRequest('/user', {}, session.token);
    if (!user || !user.login) {
      throw new Error('Сервер не вернул профиль пользователя. Проверьте токен и доступность API.');
    }
    const account = upsertAccount({ provider: session.provider, baseUrl: session.baseUrl, token: session.token, login: user.login });
    activateAccount(account.id, 'new-login');
    await persistSession();
    githubAuthState.user = user.login || '';
    githubAuthState.authType = gitProvider === 'gitea' ? 'Gitea token' : detectGitHubAuthType(account.token);
    githubAuthState.tokenSource = githubTokenSource;
    githubAuthState.scopes = [];
    githubAuthState.acceptedScopes = [];
    githubAuthState.acceptedPermissions = {};
    githubAuthLog();
    return snapshotWithUser(user);
  } catch (error) {
    gitProvider = previous.provider;
    giteaBaseUrl = previous.baseUrl;
    githubToken = previous.token;
    githubTokenSource = previous.source;
    throw error;
  }
}));

ipcMain.handle('github:restore-session', result(async () => {
  const active = await restoreToken();
  if (!active) return null;
  activateAccount(active.id, 'restored-cache');
  try {
    const user = await githubRequest('/user');
    githubAuthState.user = user.login || githubAuthState.user;
    githubAuthState.authType = gitProvider === 'gitea' ? 'Gitea token' : detectGitHubAuthType(githubToken);
    githubAuthState.tokenSource = githubTokenSource;
    githubAuthLog();
    return snapshotWithUser(user);
  } catch (error) {
    if (error?.code === 'auth') {
      try {
        await removeAccountById(active.id);
      } catch {
        await clearToken();
      }
    }
    throw error;
  }
}));

ipcMain.handle('github:logout', result(async () => {
  const active = accountsStore.findAccount(gitSession, gitSession.activeId);
  if (!active) {
    await clearToken();
    return snapshotWithUser(null);
  }
  const { user } = await removeAccountById(active.id);
  if (!user) return snapshotWithUser(null);
  githubAuthState.user = user.login || '';
  return snapshotWithUser(user);
}));

ipcMain.handle('github:switch-account', result(async (_event, id) => {
  const accountId = typeof id === 'string' ? id : id?.id;
  const target = accountsStore.findAccount(gitSession, accountId);
  if (!target) throw new Error('Аккаунт не найден');
  const previous = { provider: gitProvider, baseUrl: giteaBaseUrl, token: githubToken, source: githubTokenSource, activeId: gitSession.activeId };
  activateAccount(target.id, 'switched');
  try {
    const user = await githubRequest('/user');
    githubAuthState.user = user.login || '';
    githubAuthState.authType = gitProvider === 'gitea' ? 'Gitea token' : detectGitHubAuthType(githubToken);
    githubAuthState.tokenSource = githubTokenSource;
    githubAuthState.scopes = [];
    githubAuthState.acceptedScopes = [];
    githubAuthState.acceptedPermissions = {};
    githubAuthLog();
    await persistSession();
    return snapshotWithUser(user);
  } catch (error) {
    gitProvider = previous.provider;
    giteaBaseUrl = previous.baseUrl;
    githubToken = previous.token;
    githubTokenSource = previous.source;
    gitSession.activeId = previous.activeId;
    throw error;
  }
}));

ipcMain.handle('github:remove-account', result(async (_event, id) => {
  const accountId = typeof id === 'string' ? id : id?.id;
  const { account, user } = await removeAccountById(accountId);
  if (!account) return snapshotWithUser(null);
  if (!user) {
    const current = await githubRequest('/user');
    return snapshotWithUser(current);
  }
  return snapshotWithUser(user);
}));

ipcMain.handle('provider:get', result(async () => providerInfo()));

ipcMain.handle('session:start', result(async (_event, input) => {
  const owner = typeof input?.owner === 'string' ? input.owner : '';
  const repo = typeof input?.repo === 'string' ? input.repo : '';
  const sha = typeof input?.sha === 'string' ? input.sha : '';
  if (!validRepo(owner, repo)) throw new Error('Некорректное имя репозитория');
  if (!isValidGitSha(sha)) throw new Error('Некорректный SHA коммита');
  const file = commitSessions.validateLaunchFile(input?.launchFile);
  if (liveSessions().length > 0) {
    throw new Error('Остановите текущую сессию перед запуском новой (одна песочница за раз)');
  }
  const session = commitSessions.newSession({ owner, repo, sha, launchFile: file });
  const dir = commitSessions.sessionDir(sessionsRootDir(), session.id);
  await fs.mkdir(dir, { recursive: true });
  try {
    const { url, headers } = commitArchiveRequest(owner, repo, sha);
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Не удалось скачать архив коммита (status ${response.status})`);
    await fs.writeFile(path.join(dir, 'repo.zip'), Buffer.from(await response.arrayBuffer()));
    await fs.writeFile(path.join(dir, 'provision.cmd'), commitSessions.buildProvisionScript({ launchFile: file }), { encoding: 'utf8' });
    const wsbPath = path.join(dir, 'session.wsb');
    await fs.writeFile(wsbPath, commitSessions.buildWsb({ hostFolder: dir, logonCommand: 'cmd.exe /c C:\\gitora\\provision.cmd' }), { encoding: 'utf8' });
    const child = spawn('C:\\Windows\\System32\\WindowsSandbox.exe', [wsbPath], { detached: true, stdio: 'ignore' });
    child.unref();
    const entry = { ...session, state: 'running', pid: child.pid, dir, wsbPath };
    commitSessionRegistry.set(entry.id, entry);
    return publicSession(entry);
  } catch (error) {
    await removeSessionDir(dir);
    throw error;
  }
}));

ipcMain.handle('session:stop', result(async (_event, id) => {
  const sessionId = typeof id === 'string' ? id : id?.id;
  const entry = commitSessionRegistry.get(sessionId);
  if (!entry) throw new Error('Сессия не найдена');
  entry.state = 'stopping';
  try {
    if (commitSessions.isAlive(entry.pid)) {
      await execFileAsync('taskkill.exe', ['/PID', String(entry.pid), '/T', '/F'], { windowsHide: true });
    }
  } catch {}
  await removeSessionDir(entry.dir);
  commitSessionRegistry.delete(entry.id);
  return { id: entry.id, state: 'gone' };
}));

ipcMain.handle('session:list', result(async () => liveSessions().map(publicSession)));

ipcMain.handle('github:repos', result(async () => (
  githubRequestAll('/user/repos?per_page=100&sort=updated')
)));

ipcMain.handle('github:latest-commit', result(async (_event, { owner, repo }) => {
  if (!validRepo(owner, repo)) throw new Error('Некорректное имя репозитория');
  const commits = await githubRequest(`/repos/${owner}/${repo}/commits?per_page=1`);
  return commits[0] || null;
}));

ipcMain.handle('github:commit-detail', result(async (_event, { owner, repo, sha }) => {
  if (!validRepo(owner, repo) || typeof sha !== 'string' || !/^[a-f0-9]{7,64}$/i.test(sha)) {
    throw new Error('Некорректный идентификатор коммита');
  }
  return githubRequest(`/repos/${owner}/${repo}/commits/${encodeURIComponent(sha)}`);
}));

async function readAiSetup() {
  try {
    const saved = JSON.parse(await fs.readFile(path.join(app.getPath('userData'), 'ai-setup.json'), 'utf8'));
    if (saved?.clients && typeof saved.clients === 'object') return saved;
    if (saved?.client && Object.prototype.hasOwnProperty.call(AI_CLIENT_LABELS, saved.client)) {
      return {
        clients: {
          [saved.client]: {
            configuredAt: saved.configuredAt || '',
            requiresRestart: Boolean(saved.requiresRestart),
          },
        },
        activeClient: saved.client,
      };
    }
    return { clients: {}, activeClient: '' };
  } catch {
    return { clients: {}, activeClient: '' };
  }
}

async function writeAiSetup(data) {
  await fs.writeFile(
    path.join(app.getPath('userData'), 'ai-setup.json'),
    JSON.stringify(data, null, 2),
    { encoding: 'utf8', mode: 0o600 },
  );
}

async function pathExists(filePath) {
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function executableExists(names) {
  for (const name of names) {
    try {
      await execFileAsync(process.platform === 'win32' ? 'where.exe' : 'which', [name]);
      return true;
    } catch {}
  }
  return false;
}

function localAppDataPath() {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || path.join(path.dirname(app.getPath('appData')), 'Local');
  }
  return app.getPath('appData');
}

async function aiClientInstalled(client, configPath) {
  if (await pathExists(configPath)) return true;
  const localData = localAppDataPath();
  if (client === 'claude') {
    return pathExists(path.join(localData, 'Programs', 'Claude')) || pathExists(path.join(localData, 'Programs', 'Claude Desktop'));
  }
  if (client === 'cursor') return pathExists(path.join(localData, 'Programs', 'cursor'));
  if (client === 'codex') return pathExists(path.join(app.getPath('home'), '.codex')) || executableExists(['codex']);
  return false;
}

async function readClientConfig(client, configPath) {
  if (!await pathExists(configPath)) return '';
  return fs.readFile(configPath, 'utf8');
}

async function isClientConfigured(client, configPath) {
  const text = await readClientConfig(client, configPath);
  if (!text) return false;
  return client === 'codex' ? hasTomlMcpServer(text) : hasJsonMcpServer(text);
}

function isProcessAlive(pid) {
  const normalizedPid = Number(pid);
  if (!Number.isInteger(normalizedPid) || normalizedPid <= 0) return false;
  try {
    process.kill(normalizedPid, 0);
    return true;
  } catch {
    return false;
  }
}

function isMcpClientAlive(client) {
  const lastHeartbeat = mcpClientHeartbeats.get(client) || 0;
  return Date.now() - lastHeartbeat <= MCP_CLIENT_HEARTBEAT_TTL_MS;
}

async function aiClientStatus(id) {
  const setup = await readAiSetup();
  if (id === 'manual') {
    const clientSetup = setup.clients?.manual || {};
    const configured = Boolean(clientSetup.configuredAt);
    const connected = configured
      && !clientSetup.requiresRestart
      && isMcpClientAlive('manual');
    return {
      id: 'manual',
      label: AI_CLIENT_LABELS.manual,
      configured,
      requiresRestart: configured && Boolean(clientSetup.requiresRestart),
      configPath: '',
      supported: true,
      installed: true,
      connected,
    };
  }
  const configPath = aiClientConfigPath(id);
  const configured = await isClientConfigured(id, configPath);
  const clientSetup = setup.clients?.[id] || {};
  const connected = configured
    && !clientSetup.requiresRestart
    && isMcpClientAlive(id);
  return {
    id,
    label: AI_CLIENT_LABELS[id],
    configured,
    requiresRestart: configured && Boolean(clientSetup.requiresRestart),
    configPath,
    supported: aiClientSupported(id),
    installed: id === 'manual' ? false : await aiClientInstalled(id, configPath),
    connected,
  };
}

async function mcpConfigStatus(client) {
  if (!MCP_CLIENT_IDS.includes(client)) {
    return { configPath: '—', loaded: false, server: 'manual client' };
  }
  const configPath = aiClientConfigPath(client);
  const loaded = await pathExists(configPath);
  const configured = loaded && await isClientConfigured(client, configPath);
  return {
    configPath,
    loaded: configured,
    server: configured ? 'gitora' : 'не настроен',
  };
}

async function latestMcpStartup() {
  const logPath = mcpLogPath();
  if (!logPath) return { started: false, active: false, pid: 0, toolsLoaded: 0, client: '', lastHeartbeatAt: '' };
  try {
    const lines = (await fs.readFile(logPath, 'utf8')).trim().split(/\r?\n/).filter(Boolean);
    const entries = lines.flatMap(line => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
    const startupEntries = entries.filter(entry => (
      entry.process === 'gitora-mcp-server'
      && entry.event === 'mcp_startup'
      && entry.started
      && Number(entry.pid) > 0
    ));
    const startup = [...startupEntries].reverse().find(candidate => {
      const pid = Number(candidate.pid);
      if (!isProcessAlive(pid)) return false;
      const startupAt = new Date(candidate.at || 0).getTime();
      const heartbeat = [...entries].reverse().find(entry => (
        entry.process === 'gitora-mcp-server'
        && entry.event === 'mcp_heartbeat_ok'
        && new Date(entry.at || 0).getTime() >= startupAt
        && entry.client === candidate.client
      ));
      const heartbeatAt = heartbeat?.at ? new Date(heartbeat.at).getTime() : 0;
      return heartbeatAt > 0 && Date.now() - heartbeatAt <= MCP_CLIENT_HEARTBEAT_TTL_MS * 2;
    }) || [...startupEntries].reverse().find(candidate => isProcessAlive(Number(candidate.pid)));
    if (!startup) return { started: false, active: false, pid: 0, toolsLoaded: 0, client: '', lastHeartbeatAt: '' };
    const startupAt = new Date(startup.at || 0).getTime();
    const heartbeat = [...entries].reverse().find(entry => (
      entry.process === 'gitora-mcp-server'
      && entry.event === 'mcp_heartbeat_ok'
      && new Date(entry.at || 0).getTime() >= startupAt
      && entry.client === startup.client
    ));
    const pid = Number(startup.pid) || 0;
    const lastHeartbeatAt = heartbeat?.at || '';
    const heartbeatFresh = lastHeartbeatAt
      && Date.now() - new Date(lastHeartbeatAt).getTime() <= MCP_CLIENT_HEARTBEAT_TTL_MS * 2;
    const pidAlive = isProcessAlive(pid);
    return {
      started: pidAlive,
      active: pidAlive && Boolean(heartbeatFresh),
      pid,
      toolsLoaded: Number(startup.toolsLoaded) || 0,
      client: typeof startup.client === 'string' ? startup.client : '',
      lastHeartbeatAt,
    };
  } catch {}
  return { started: false, active: false, pid: 0, toolsLoaded: 0, client: '', lastHeartbeatAt: '' };
}

async function getAiStatusData(currentRepository = '') {
  const startup = await latestMcpStartup();
  const clients = await Promise.all(MCP_CLIENT_IDS.map(clientId => aiClientStatus(clientId)));
  const liveClients = clients.map(item => item.id === startup.client && startup.active
    ? { ...item, connected: true, requiresRestart: false }
    : item);
  const manualClient = await aiClientStatus('manual');
  const setup = await readAiSetup();
  const connectedClient = liveClients
    .filter(item => item.connected)
    .sort((left, right) => (mcpClientHeartbeats.get(right.id) || 0) - (mcpClientHeartbeats.get(left.id) || 0))[0];
  const activeId = (startup.active && (MCP_CLIENT_IDS.includes(startup.client) || startup.client === 'manual') ? startup.client : '')
    || connectedClient?.id
    || (MCP_CLIENT_IDS.includes(setup.activeClient) ? setup.activeClient : '')
    || liveClients.find(item => item.configured)?.id
    || (manualClient.configured ? 'manual' : 'manual');
  const client = activeId === 'manual'
    ? manualClient
    : liveClients.find(item => item.id === activeId) || await aiClientStatus(activeId);
  const mcpConfig = await mcpConfigStatus(activeId);
  const mcpClient = {
    connected: Boolean(client.connected && (activeId === startup.client ? startup.active : isMcpClientAlive(activeId))),
    session: mcpBridge?.metadata?.sessionId || '',
  };
  mcpConfigLog(mcpConfig);
  mcpClientLog(mcpClient);
  const bridgeRunning = Boolean(mcpBridge?.isRunning?.());
  const serverExists = await pathExists(MCP_SERVER_PATH);
  const toolsAvailable = bridgeRunning && serverExists && startup.active && startup.toolsLoaded > 0 && mcpClient.connected;
  const repoAvailable = Boolean(currentRepository) && Boolean(githubToken);
  const infrastructureError = client.configured && (
    !serverExists
    || !bridgeRunning
  );
  const level = !client.configured
    ? 'not_configured'
    : infrastructureError
      ? 'error'
      : mcpClient.connected ? 'ready' : 'attention';
  const label = level === 'ready'
    ? 'Подключено'
    : level === 'attention'
      ? 'Ожидает MCP-сессию — подключить сейчас'
      : level === 'error'
        ? 'Ошибка подключения'
        : 'Не настроено';
  return {
    level,
    label,
    githubConnected: Boolean(githubToken),
    githubUser: githubAuthState.user || undefined,
    githubAuth: authSnapshot({ ...githubAuthState, tokenSource: githubTokenSource }),
    mcpConfig,
    mcpStartup: startup,
    mcpClient,
    ...mcpWriteStatus(),
    mcpRunning: bridgeRunning,
    mcpServerPath: MCP_SERVER_PATH,
    mcpMetadataPath,
    mcpSessionId: mcpBridge?.metadata?.sessionId || '',
    currentRepository,
    repositoryAvailable: repoAvailable,
    toolCount: MCP_TOOLS.length,
    tools: MCP_TOOLS.map(tool => ({
      ...tool,
      available: toolsAvailable,
      ...(toolsAvailable ? {} : { error: !serverExists ? 'Файл MCP-сервера не найден' : 'Локальный мост не отвечает' }),
    })),
    client,
    clients: liveClients,
    lastSuccessfulRequest: mcpLastSuccessfulRequest || undefined,
    lastError: mcpLastError || undefined,
    configTemplate: aiConfigTemplate('manual'),
    activity: [...mcpActivityLog],
  };
}

async function runAiDiagnostics(owner, repo, sha) {
  const steps = [];
  const check = async (id, label, operation, fallback) => {
    const startedAt = Date.now();
    try {
      const detail = await operation();
      steps.push({ id, label, status: 'success', detail, durationMs: Date.now() - startedAt });
      return true;
    } catch (error) {
      steps.push({ id, label, status: fallback?.status || 'error', detail: error instanceof Error ? error.message : fallback?.detail || 'Проверка не пройдена', durationMs: Date.now() - startedAt });
      return false;
    }
  };

  await check('server-file', 'Файл MCP-сервера', async () => {
    if (!await pathExists(MCP_SERVER_PATH)) throw new Error('mcp-server.cjs не найден');
    return `Найден: ${MCP_SERVER_PATH}`;
  });
  await check('bridge', 'Локальный мост Gitora', async () => {
    if (!mcpBridge?.isRunning?.()) throw new Error('Локальный мост не запущен');
    return 'Мост запущен и готов принимать запросы';
  });
  await check('tools', 'MCP-инструменты', async () => `${MCP_TOOLS.length} инструментов доступны через Gitora`);
  await check('github-cli', 'GitHub CLI', async () => 'Не используется: Gitora работает через встроенный GitHub REST API; gh CLI не требуется.');
  await check('mcp-config', 'Конфигурация MCP-клиента', async () => {
    const codexConfig = aiClientConfigPath('codex');
    const codexConfigured = await isClientConfigured('codex', codexConfig);
    if (!codexConfigured) {
      throw new Error(`Codex config не найден или Gitora MCP server не зарегистрирован: ${codexConfig}`);
    }
    return `Codex config: ${codexConfig}; Gitora MCP server: ${MCP_SERVER_PATH}`;
  });
  await check('mcp-startup', 'Запуск MCP-сервера', async () => {
    const startup = await latestMcpStartup();
    if (!startup.started || !startup.active || startup.pid <= 0) {
      throw new Error('mcp-server.cjs не имеет живого PID и свежего heartbeat; старый журнал не считается активным подключением');
    }
    if (startup.toolsLoaded <= 0) {
      throw new Error(`mcp-server.cjs запустился (PID ${startup.pid}), но MCP tools не загрузились`);
    }
    return `mcp-server.cjs запущен; PID: ${startup.pid}; tools loaded: ${startup.toolsLoaded}`;
  });
  await check('mcp-client', 'MCP-клиент Codex', async () => {
    const startup = await latestMcpStartup();
    const activeClient = startup.active ? startup.client : MCP_CLIENT_IDS.find(clientId => isMcpClientAlive(clientId));
    if (!activeClient) {
      throw new Error('Codex MCP-сессия не активна. Нажмите «Подключить сейчас». Для первой регистрации нового MCP-сервера Codex может потребоваться открыть новый чат.');
    }
    const session = mcpBridge?.metadata?.sessionId || '—';
    return `Клиент: ${activeClient}; connected: true; session: ${session}`;
  });
  const githubOk = await check('github', 'GitHub-сессия', async () => {
    const profile = await githubRequestPage('/user');
    const rateLimit = profile.rateLimitRemaining && profile.rateLimitLimit
      ? `лимит API ${profile.rateLimitRemaining}/${profile.rateLimitLimit}`
      : 'лимит API не сообщён';
    const scopes = profile.oauthScopes || 'scopes не сообщены (возможно fine-grained PAT)';
    return `Подключён как ${profile.data.login}; тип: ${githubAuthState.authType}; источник: ${githubTokenSource}; ${rateLimit}; scopes: ${scopes}`;
  });
  let repos = null;
  if (githubOk) {
    await check('repos', 'Список репозиториев', async () => {
      repos = await githubRequestAll('/user/repos?per_page=100&sort=updated');
      return `Получено репозиториев: ${repos.length}`;
    });
  } else {
    steps.push({ id: 'repos', label: 'Список репозиториев', status: 'skipped', detail: 'Сначала подключитесь с PAT' });
  }
  const hasRepo = validRepo(owner, repo);
  let repositoryEmpty = false;
  if (hasRepo && githubOk) {
    await check('repository', 'Текущий репозиторий', async () => {
      const repositoryInfo = await githubRequest(`/repos/${owner}/${repo}`);
      repositoryEmpty = isEmptyRepository(repositoryInfo);
      githubAuthState.repository = `${owner}/${repo}`;
      githubAuthState.permissions = { ...(repositoryInfo?.permissions || {}) };
      githubAuthLog();
      const permissions = Object.entries(githubAuthState.permissions)
        .map(([name, allowed]) => `${name}=${allowed ? 'yes' : 'no'}`)
        .join(', ') || 'не сообщены';
      return `${owner}/${repo} доступен; repository permissions: ${permissions}`;
    });
    const permissionChecks = authSnapshot({ ...githubAuthState, tokenSource: githubTokenSource }).permissionChecks;
    const missingPermissions = permissionChecks.filter(checkItem => checkItem.status === 'missing');
    steps.push({
      id: 'permissions',
      label: 'GitHub permissions',
      status: missingPermissions.length ? 'warning' : 'success',
      detail: permissionChecks.map(checkItem => `${checkItem.permission}: ${checkItem.status}`).join('; '),
    });
    let testSha = typeof sha === 'string' && /^[a-f0-9]{7,64}$/i.test(sha) ? sha : '';
    if (repositoryEmpty) {
      steps.push({ id: 'commits', label: 'Ветки и коммиты', status: 'success', detail: 'Репозиторий пуст; после первого commit данные появятся.' });
    } else {
      await check('commits', 'Ветки и коммиты', async () => {
        const [branches, commits] = await Promise.all([
          githubRequest(`/repos/${owner}/${repo}/branches?per_page=1`),
          githubRequest(`/repos/${owner}/${repo}/commits?per_page=1`),
        ]);
        if (!testSha) testSha = commits?.[0]?.sha || '';
        return `${branches.length} ветка и ${commits.length} коммит доступны для проверки`;
      });
    }
    if (testSha) {
      await check('commit-detail', 'Детали тестового коммита', async () => {
        await githubRequest(`/repos/${owner}/${repo}/commits/${encodeURIComponent(testSha)}`);
        return `Детали ${testSha.slice(0, 7)} доступны`;
      });
    } else {
      steps.push({ id: 'commit-detail', label: 'Детали тестового коммита', status: 'skipped', detail: 'В репозитории пока нет коммитов' });
    }
    const writeChecks = [
      ['PUT', `/repos/${owner}/${repo}/contents/diagnostics-gitora.txt`, 'создание файла', 'Contents: write'],
      ['POST', `/repos/${owner}/${repo}/git/commits`, 'создание commit', 'Contents: write'],
      ['POST', `/repos/${owner}/${repo}/issues`, 'создание Issue', 'Issues: write'],
      ['POST', `/repos/${owner}/${repo}/issues/1/comments`, 'добавление комментария', 'Issues: write или Pull requests: write'],
      ['POST', `/repos/${owner}/${repo}/pulls`, 'создание Pull Request', 'Pull requests: write'],
      ['POST', `/repos/${owner}/${repo}/pulls/1/reviews`, 'одобрение Pull Request', 'Pull requests: write'],
      ['PUT', `/repos/${owner}/${repo}/pulls/1/merge`, 'слияние Pull Request', 'Contents: write'],
    ];
    for (const [method, endpoint, action, requiredPermission] of writeChecks) {
      githubWriteLog({
        repository: `${owner}/${repo}`,
        action: `${method} ${endpoint} (${action})`,
        requiredPermission,
        result: 'not-run: diagnostic writes require explicit user confirmation',
      });
    }
    steps.push({
      id: 'write-permissions',
      label: 'Проверка прав записи',
      status: 'warning',
      detail: 'Изменяющие GitHub операции не выполняются автоматически. Для PR нужны Pull requests: write (одобрение) и Contents: write (слияние); см. журнал GitHub Write.',
    });
  } else {
    steps.push({ id: 'repository', label: 'Текущий репозиторий', status: 'skipped', detail: 'Выберите репозиторий в Gitora' });
    steps.push({ id: 'commits', label: 'Ветки и коммиты', status: 'skipped', detail: 'Сначала выберите доступный репозиторий' });
    steps.push({ id: 'commit-detail', label: 'Детали тестового коммита', status: 'skipped', detail: 'Сначала выберите доступный репозиторий' });
    steps.push({ id: 'write-permissions', label: 'Проверка прав записи', status: 'skipped', detail: 'Сначала выберите доступный репозиторий' });
  }
  const status = await getAiStatusData(validRepo(owner, repo) ? `${owner}/${repo}` : '');
  const hasError = steps.some(step => step.status === 'error');
  const hasWarning = steps.some(step => step.status === 'warning' || step.status === 'skipped');
  const level = hasError || status.level === 'error' ? 'error' : hasWarning || status.level !== 'ready' ? 'attention' : 'ready';
  return { level, steps, status: { ...status, level }, checkedAt: new Date().toISOString() };
}

ipcMain.handle('ai:get-status', result(async () => getAiStatusData()));

ipcMain.handle('ai:diagnostics', result(async (_event, { owner, repo, sha } = {}) => runAiDiagnostics(owner, repo, sha)));

async function saveAiClientSetup(client, values) {
  const setup = await readAiSetup();
  await writeAiSetup({
    ...setup,
    clients: {
      ...(setup.clients || {}),
      [client]: values,
    },
    activeClient: client,
  });
}

ipcMain.handle('ai:configure-client', result(async (_event, { client } = {}) => {
  if (!Object.prototype.hasOwnProperty.call(AI_CLIENT_LABELS, client)) throw new Error('Неизвестный ИИ-клиент');
  const template = aiConfigTemplate(client === 'codex' ? 'codex' : client === 'manual' || client === 'other' ? 'manual' : 'claude');
  if (client === 'manual') {
    const setup = await readAiSetup();
    const previous = setup.clients?.manual;
    await saveAiClientSetup('manual', {
      configuredAt: previous?.configuredAt || new Date().toISOString(),
      requiresRestart: previous?.configuredAt ? Boolean(previous.requiresRestart) : true,
    });
    return {
      client: await aiClientStatus('manual'),
      configPath: '',
      configTemplate: template,
    };
  }
  if (!aiClientSupported(client)) {
    return {
      client: { id: 'manual', label: AI_CLIENT_LABELS.manual, configPath: '', configured: false, requiresRestart: false, supported: false, installed: false, connected: false },
      configPath: '',
      configTemplate: template,
    };
  }

  const configPath = aiClientConfigPath(client);
  if (!await aiClientInstalled(client, configPath)) {
    throw new Error(`${AI_CLIENT_LABELS[client]} не найден на этом компьютере.`);
  }

  const exists = await pathExists(configPath);
  const original = exists ? await fs.readFile(configPath, 'utf8') : '';
  let nextConfig;
  try {
    nextConfig = client === 'codex'
      ? upsertTomlMcpServer(original, mcpLaunchDefinition(client))
      : upsertJsonMcpServer(original, mcpLaunchDefinition(client));
  } catch {
    throw new Error('Не удалось прочитать настройки ИИ-клиента. Другие подключения не изменены.');
  }
  const backupPath = exists ? `${configPath}.gitora-backup-${Date.now()}${client === 'codex' ? '.toml' : '.json'}` : undefined;
  if (exists) await fs.copyFile(configPath, backupPath);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, nextConfig, { encoding: 'utf8', mode: 0o600 });
  if (!await isClientConfigured(client, configPath)) {
    throw new Error('Gitora не смогла проверить сохранённые настройки. Изменения не подтверждены.');
  }
  await saveAiClientSetup(client, { configuredAt: new Date().toISOString(), requiresRestart: true });
  return { client: await aiClientStatus(client), configPath, backupPath, configTemplate: template };
}));

ipcMain.handle('ai:disconnect-client', result(async (_event, { client } = {}) => {
  if (!MCP_CLIENT_IDS.includes(client)) throw new Error('Неизвестный ИИ-клиент');
  const configPath = aiClientConfigPath(client);
  const exists = await pathExists(configPath);
  if (exists) {
    const original = await fs.readFile(configPath, 'utf8');
    const nextConfig = client === 'codex' ? removeTomlMcpServer(original) : removeJsonMcpServer(original);
    const backupPath = `${configPath}.gitora-backup-${Date.now()}${client === 'codex' ? '.toml' : '.json'}`;
    await fs.copyFile(configPath, backupPath);
    await fs.writeFile(configPath, nextConfig, { encoding: 'utf8', mode: 0o600 });
    if (await isClientConfigured(client, configPath)) throw new Error('Не удалось отключить Gitora из настроек клиента.');
  }
  const setup = await readAiSetup();
  const { [client]: _removed, ...otherClients } = setup.clients || {};
  await writeAiSetup({ ...setup, clients: otherClients, activeClient: setup.activeClient === client ? '' : setup.activeClient });
  return aiClientStatus(client);
}));

ipcMain.handle('ai:restart-mcp', result(async () => {
  if (!mcpBridge && !mcpBridgeStartPromise) throw new Error('Локальный мост Gitora ещё не создан');
  mcpClientHeartbeats.clear();
  mcpClientLog({ connected: false, session: mcpBridge?.metadata?.sessionId || '' });
  await mcpBridge?.stop({ notifyClients: false });
  mcpBridge = null;
  const metadata = await startMcpBridge();
  if (!metadata) throw new Error('Не удалось перезапустить локальный мост Gitora');
  mcpLastError = '';
  return getAiStatusData();
}));

ipcMain.handle('ai:allow-mcp-writes', result(async (_event, options = {}) => {
  const duration = options?.duration || '10m';
  if (!MCP_WRITE_DURATIONS.has(duration)) throw new Error('Некорректный срок разрешения записи MCP');

  mcpWriteDuration = duration;
  mcpWriteExpiresAt = duration === 'forever'
    ? Number.POSITIVE_INFINITY
    : Date.now() + MCP_WRITE_APPROVAL_TTLS_MS[duration];
  mcpLog('mcp_write_approval_granted', {
    duration,
    expiresAt: Number.isFinite(mcpWriteExpiresAt) ? new Date(mcpWriteExpiresAt).toISOString() : null,
  });
  return mcpWriteStatus();
}));

ipcMain.handle('ai:revoke-mcp-writes', result(async () => {
  const status = revokeMcpWrites();
  mcpLog('mcp_write_approval_revoked');
  return status;
}));

ipcMain.handle('ai:open-config-folder', result(async (_event, { client } = {}) => {
  const configPath = aiClientConfigPath(client);
  const folder = configPath ? path.dirname(configPath) : app.getPath('userData');
  await shell.openPath(folder);
  return null;
}));

ipcMain.handle('github:repository', result(async (_event, { owner, repo, commitLimit }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  if (!isValidCommitLimit(commitLimit)) throw new Error('Некорректный лимит коммитов');
  const repositoryInfo = await githubRequest(`/repos/${owner}/${repo}`);
  if (isEmptyRepository(repositoryInfo)) {
    return { commits: [], branches: [], empty: true, defaultBranch: repositoryInfo.default_branch || 'main', repository: repositoryInfo };
  }
  const defaultBranch = repositoryInfo.default_branch || 'main';
  const [defaultCommits, branches] = await Promise.all([
    githubRequest(`/repos/${owner}/${repo}/commits?per_page=${commitLimit}`),
    githubRequest(`/repos/${owner}/${repo}/branches?per_page=100`),
  ]);
  const defaultCommitShas = new Set(defaultCommits.map(commit => commit.sha));
  const branchHistories = await Promise.all(
    branches
      .filter(branch => branch.name !== defaultBranch && branch.commit?.sha && !defaultCommitShas.has(branch.commit.sha))
      .map(async branch => {
        try {
          return await githubRequest(`/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch.name)}&per_page=${commitLimit}`);
        } catch {
          return [];
        }
      }),
  );
  const commits = mergeGitHubCommits(defaultCommits, ...branchHistories);
  return { commits, branches, empty: false, defaultBranch, repository: repositoryInfo };
}));

ipcMain.handle('github:collaborators', result(async (_event, { owner, repo }) => (
  githubTeamList(teamRepositoryEndpoint(owner, repo, '/collaborators?affiliation=all&per_page=100'))
)));

ipcMain.handle('github:invitations', result(async (_event, { owner, repo }) => (
  githubTeamList(teamRepositoryEndpoint(owner, repo, '/invitations?per_page=100'))
)));

ipcMain.handle('github:contributors', result(async (_event, { owner, repo }) => (
  githubTeamList(teamRepositoryEndpoint(owner, repo, '/contributors?anon=1&per_page=100'))
)));

ipcMain.handle('github:contributor-stats', result(async (_event, { owner, repo }) => (
  githubContributorStats(teamRepositoryEndpoint(owner, repo, '/stats/contributors'))
)));

ipcMain.handle('github:contributor-timeline', result(async (_event, { owner, repo, login }) => {
  if (!isValidGitHubUsername(login)) throw new Error('Некорректное имя пользователя GitHub');
  return githubTeamList(teamRepositoryEndpoint(owner, repo, `/commits?author=${encodeURIComponent(login)}&per_page=100`));
}));

ipcMain.handle('github:user-profile', result(async (_event, login) => {
  if (!isValidGitHubUsername(login)) throw new Error('Некорректное имя пользователя GitHub');
  const cached = userProfileCache.get(login);
  if (cached && cached.expiresAt > Date.now()) return cached.profile;
  const profile = await githubRequest(`/users/${encodeURIComponent(login)}`);
  userProfileCache.set(login, { profile, expiresAt: Date.now() + 5 * 60 * 1000 });
  return profile;
}));

ipcMain.handle('github:add-collaborator', result(async (_event, { owner, repo, login, permission }) => (
  mutateCollaborator(owner, repo, login, permission)
)));

ipcMain.handle('github:update-collaborator', result(async (_event, { owner, repo, login, permission }) => (
  mutateCollaborator(owner, repo, login, permission)
)));

ipcMain.handle('github:remove-collaborator', result(async (_event, { owner, repo, login }) => {
  if (!isValidGitHubUsername(login)) throw new Error('Некорректное имя пользователя GitHub');
  const page = await githubRequestPage(teamRepositoryEndpoint(owner, repo, `/collaborators/${encodeURIComponent(login)}`), { method: 'DELETE' });
  return { status: page.status === 201 ? 201 : 204 };
}));

ipcMain.handle('github:cancel-invitation', result(async (_event, { owner, repo, invitationId }) => {
  if (!isValidInvitationId(invitationId)) throw new Error('Некорректный идентификатор приглашения');
  const page = await githubRequestPage(teamRepositoryEndpoint(owner, repo, `/invitations/${invitationId}`), { method: 'DELETE' });
  return { status: page.status === 201 ? 201 : 204 };
}));

ipcMain.handle('github:create-repo', result(async (_event, input) => {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name || !REPO_PART.test(name)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  const autoInit = input?.autoInit === undefined ? true : Boolean(input.autoInit);
  const gitignoreTemplate = typeof input?.gitignoreTemplate === 'string' ? input.gitignoreTemplate.trim() : '';
  const licenseTemplate = typeof input?.licenseTemplate === 'string' ? input.licenseTemplate.trim() : '';
  if (gitignoreTemplate && !TEMPLATE_PART.test(gitignoreTemplate)) throw new Error('Некорректный шаблон .gitignore');
  if (licenseTemplate && !TEMPLATE_PART.test(licenseTemplate)) throw new Error('Некорректный шаблон лицензии');
  const repo = await githubRequest('/user/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: typeof input.description === 'string' ? input.description.trim() : '',
      private: Boolean(input.private),
      auto_init: autoInit,
      ...(gitignoreTemplate ? { gitignore_template: gitignoreTemplate } : {}),
      ...(licenseTemplate ? { license_template: licenseTemplate } : {}),
    }),
  });

  const folderPath = typeof input?.folderPath === 'string' ? input.folderPath.trim() : '';
  if (!folderPath) {
    return { repo, uploadStatus: 'none', uploadedCount: 0, skippedCount: 0 };
  }

  const folderData = await scanUploadFolder(folderPath);
  if (folderData.files.length === 0) {
    return { repo, uploadStatus: 'none', uploadedCount: 0, skippedCount: 0 };
  }

  try {
    const [owner] = repo.full_name.split('/');
    const uploadResult = gitProvider === 'gitea'
      ? await uploadFolderToGiteaRepo(owner, repo.name, folderData, repo)
      : await uploadFolderToRepo(owner, repo.name, folderData, repo);
    return { repo, ...uploadResult };
  } catch (uploadError) {
    return { repo, uploadStatus: 'error', uploadedCount: 0, skippedCount: folderData.fileCount };
  }
}));

ipcMain.handle('github:delete-repo', result(async (_event, { owner, repo }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  await githubRequest(`/repos/${owner}/${repo}`, { method: 'DELETE' });
  return null;
}));

ipcMain.handle('github:update-repo', result(async (_event, { owner, repo, data }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  if (data.name && !REPO_PART.test(data.name)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  return githubRequest(`/repos/${owner}/${repo}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}));

ipcMain.handle('github:create-branch', result(async (_event, { owner, repo, name, fromSha }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  if (!isValidGitRef(name)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ РІРµС‚РєРё');
  if (!isValidGitSha(fromSha)) throw new Error('Некорректный SHA исходного коммита');
  return githubRequest(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref: `refs/heads/${name}`,
      sha: fromSha,
    }),
  });
}));

ipcMain.handle('github:delete-branch', result(async (_event, { owner, repo, branch }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  if (!isValidGitRef(branch)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ РІРµС‚РєРё');
  await githubRequest(`/repos/${owner}/${repo}/git/refs/heads/${refPath(branch)}`, { method: 'DELETE' });
  return null;
}));

ipcMain.handle('github:rename-branch', result(async (_event, { owner, repo, branch, newName }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  if (!isValidGitRef(branch)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ РІРµС‚РєРё');
  if (!isValidGitRef(newName)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РЅРѕРІРѕРµ РёРјСЏ РІРµС‚РєРё');

  if (gitProvider === 'gitea') return renameGiteaBranch(owner, repo, branch, newName);
  const ref = await githubRequest(`/repos/${owner}/${repo}/git/refs/heads/${refPath(branch)}`);
  return githubRequest(`/repos/${owner}/${repo}/git/refs/heads/${refPath(branch)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref: `refs/heads/${newName}`,
      sha: ref.object.sha,
      force: true,
    }),
  });
}));

ipcMain.handle('github:pull-requests', result(async (_event, { owner, repo, state }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  const params = new URLSearchParams({ per_page: '30' });
  if (state) params.set('state', state);
  return githubRequest(`/repos/${owner}/${repo}/pulls?${params}`);
}));

ipcMain.handle('github:pull-request', result(async (_event, { owner, repo, number }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  if (!isValidIssueNumber(number)) throw new Error('Некорректный номер pull request');
  return githubRequest(`/repos/${owner}/${repo}/pulls/${number}`);
}));

ipcMain.handle('github:pull-request-files', result(async (_event, { owner, repo, number }) => {
  if (!validRepo(owner, repo)) throw new Error('Некорректное имя репозитория');
  if (!isValidIssueNumber(number)) throw new Error('Некорректный номер pull request');
  return githubRequest(`/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`);
}));

ipcMain.handle('github:approve-pull-request', result(async (_event, { owner, repo, number }) => {
  if (!validRepo(owner, repo)) throw new Error('Некорректное имя репозитория');
  if (!isValidIssueNumber(number)) throw new Error('Некорректный номер pull request');
  return githubRequest(`/repos/${owner}/${repo}/pulls/${number}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'APPROVE' }),
  });
}));

ipcMain.handle('github:merge-pull-request', result(async (_event, { owner, repo, number, sha }) => {
  if (!validRepo(owner, repo)) throw new Error('Некорректное имя репозитория');
  if (!isValidIssueNumber(number)) throw new Error('Некорректный номер pull request');
  if (sha !== undefined && !isValidGitSha(sha)) throw new Error('Некорректный SHA pull request');

  const payload = { merge_method: 'merge', ...(sha ? { sha } : {}) };
  const mergeResult = await githubRequest(`/repos/${owner}/${repo}/pulls/${number}/merge`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!mergeResult?.merged) {
    const error = new Error(mergeResult?.message || 'GitHub не объединил pull request');
    error.status = 409;
    throw error;
  }
  return mergeResult;
}));

ipcMain.handle('github:update-pull-request-state', result(async (_event, { owner, repo, number, state }) => {
  if (!validRepo(owner, repo)) throw new Error('Некорректное имя репозитория');
  if (!isValidIssueNumber(number)) throw new Error('Некорректный номер pull request');
  if (state !== 'open' && state !== 'closed') throw new Error('Некорректное состояние pull request');
  return githubRequest(`/repos/${owner}/${repo}/pulls/${number}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  });
}));

ipcMain.handle('github:create-pull-request', result(async (_event, { owner, repo, title, body, head, base }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  if (!title) throw new Error('Р’РІРµРґРёС‚Рµ Р·Р°РіРѕР»РѕРІРѕРє pull request');
  return githubRequest(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body, head, base }),
  });
}));

ipcMain.handle('github:issues', result(async (_event, { owner, repo, state }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  const params = new URLSearchParams({ per_page: '30' });
  if (state) params.set('state', state);
  return githubRequest(`/repos/${owner}/${repo}/issues?${params}`);
}));

ipcMain.handle('github:issue', result(async (_event, { owner, repo, number }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  if (!isValidIssueNumber(number)) throw new Error('Некорректный номер issue');
  return githubRequest(`/repos/${owner}/${repo}/issues/${number}`);
}));

ipcMain.handle('github:create-issue', result(async (_event, { owner, repo, title, body, labels }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  if (!title) throw new Error('Р’РІРµРґРёС‚Рµ Р·Р°РіРѕР»РѕРІРѕРє Р·Р°РґР°С‡Рё');
  const payload = { title, body };
  if (labels && labels.length > 0) {
    Object.assign(payload, { labels });
  }
  if (gitProvider === 'gitea') {
    // Gitea issues API expects label IDs: resolve names first.
    const labelIds = await resolveGiteaLabelIds(owner, repo, labels);
    if (labelIds) payload.labels = labelIds;
    else delete payload.labels;
  }
  return githubRequest(`/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}));

ipcMain.handle('github:create-release', result(async (_event, { owner, repo, input }) => {
  if (!validRepo(owner, repo)) throw new Error('Некорректное имя репозитория');
  const tagName = typeof input?.tagName === 'string' ? input.tagName.trim() : '';
  if (!tagName) throw new Error('Введите тег релиза');

  const release = await githubRequest(`/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tagName,
      target_commitish: input.targetCommitish || undefined,
      name: input.name || tagName,
      body: input.body || '',
      draft: Boolean(input.draft),
      prerelease: Boolean(input.prerelease),
      ...(input.makeLatest ? { make_latest: input.makeLatest } : {}),
    }),
  });

  const assetPath = typeof input?.assetPath === 'string' ? input.assetPath.trim() : '';
  if (!assetPath) return mapRelease(release);

  if (gitProvider === 'gitea') return uploadGiteaReleaseAsset(owner, repo, release, assetPath);

  const asset = await fs.readFile(assetPath);
  const uploadUrl = release.upload_url.replace(
    '{?name,label}',
    `?name=${encodeURIComponent(path.basename(assetPath))}`,
  );
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...githubHeaders(),
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(asset.length),
    },
    body: asset,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || 'Не удалось загрузить файл релиза');
  }

  return mapRelease(await githubRequest(`/repos/${owner}/${repo}/releases/${release.id}`));
}));

ipcMain.handle('github:get-readme', result(async (_event, { owner, repo, branch }) => {
  if (!validRepo(owner, repo)) throw new Error('Некорректное имя репозитория');
  const ref = typeof branch === 'string' && branch.trim() ? branch.trim() : 'main';
  const readmeUrl = gitProvider === 'gitea'
    ? `${giteaApiOrigin(giteaBaseUrl)}/repos/${owner}/${repo}/contents/README.md?ref=${encodeURIComponent(ref)}`
    : `${API_ORIGIN}/repos/${owner}/${repo}/contents/README.md?ref=${encodeURIComponent(ref)}`;
  const response = await fetch(readmeUrl, {
    headers: authHeaders(),
  });
  if (response.status === 404) return '';
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(githubErrorMessage(response.status, data?.message, `/repos/${owner}/${repo}/contents/README.md`, 'GET'));
  return Buffer.from(String(data.content || '').replace(/\s/g, ''), 'base64').toString('utf8');
}));

ipcMain.handle('github:save-readme', result(async (_event, { owner, repo, branch, content, message }) => {
  if (!validRepo(owner, repo)) throw new Error('Некорректное имя репозитория');
  const ref = typeof branch === 'string' && branch.trim() ? branch.trim() : 'main';
  const cleanMessage = typeof message === 'string' && message.trim() ? message.trim() : 'Обновлён README';
  const buffer = Buffer.from(typeof content === 'string' ? content : '', 'utf8');
  if (gitProvider === 'gitea') {
    const result = await giteaCommitFile({
      owner,
      repo,
      branch: ref,
      relativePath: 'README.md',
      content: buffer,
      message: cleanMessage,
    });
    return { sha: result.sha, changed: result.changed };
  }
  const repositoryInfo = await githubRequest(`/repos/${owner}/${repo}`);
  if (isEmptyRepository(repositoryInfo)) {
    const result = await createRepositoryFile(
      (endpoint, options = {}) => githubRequest(endpoint, {
        ...options,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      }),
      {
        owner,
        repo,
        path: 'README.md',
        message: cleanMessage,
        content: buffer.toString('utf8'),
        branch: ref,
        repository: repositoryInfo,
      },
    );
    return { sha: result.commit.sha, changed: true };
  }
  const branchState = await getBranchState(owner, repo, ref);
  const remoteFiles = mapRemoteFiles(branchState.tree);
  const remote = remoteFiles.get('README.md');
  if (remote?.sha === gitBlobSha(buffer)) return { sha: branchState.headSha, changed: false };

  const localFiles = new Map([['README.md', { content: buffer }]]);
  const commit = await commitTreeChanges(
    owner,
    repo,
    ref,
    branchState.treeSha,
    branchState.headSha,
    [{ path: 'README.md', status: remote ? 'modified' : 'added' }],
    localFiles,
    cleanMessage,
  );
  return { sha: commit.sha, changed: true };
}));

ipcMain.handle('github:check-folder-changes', result(async (_event, { owner, repo, branch, folderPath }) => {
  if (!validRepo(owner, repo)) throw new Error('Некорректное имя репозитория');
  const ref = typeof branch === 'string' && branch.trim() ? branch.trim() : 'main';
  const cleanFolderPath = typeof folderPath === 'string' ? folderPath.trim() : '';
  if (!cleanFolderPath) throw new Error('Выберите папку проекта');
  const data = gitProvider === 'gitea'
    ? await buildGiteaFolderChanges(owner, repo, ref, cleanFolderPath)
    : await buildFolderChanges(owner, repo, ref, cleanFolderPath);
  return {
    folderPath: data.folderPath,
    branch: data.branch,
    warnings: data.warnings,
    added: data.added,
    modified: data.modified,
    deleted: data.deleted,
    changes: data.changes.slice(0, 200),
  };
}));

ipcMain.handle('github:commit-folder-changes', result(async (_event, { owner, repo, branch, folderPath, message }) => {
  if (!validRepo(owner, repo)) throw new Error('Некорректное имя репозитория');
  const ref = typeof branch === 'string' && branch.trim() ? branch.trim() : 'main';
  const cleanFolderPath = typeof folderPath === 'string' ? folderPath.trim() : '';
  if (!cleanFolderPath) throw new Error('Выберите папку проекта');
  const cleanMessage = typeof message === 'string' && message.trim() ? message.trim() : 'Обновлены файлы проекта';
  if (gitProvider === 'gitea') {
    const giteaData = await buildGiteaFolderChanges(owner, repo, ref, cleanFolderPath);
    return commitGiteaFolderChanges(owner, repo, ref, giteaData, cleanMessage);
  }
  const data = await buildFolderChanges(owner, repo, ref, cleanFolderPath);
  if (data.changes.length === 0) return { sha: data.branchState.headSha, changed: false };
  const commit = await commitTreeChanges(
    owner,
    repo,
    ref,
    data.branchState.treeSha,
    data.branchState.headSha,
    data.changes,
    data.files,
    cleanMessage,
  );
  return { sha: commit.sha, changed: true, count: data.changes.length };
}));

ipcMain.handle('git:check-folder-changes', result(async (_event, { folderPath, targetBranch }) => (
  buildGitFolderChanges(folderPath, targetBranch)
)));

ipcMain.handle('git:commit-folder-changes', result(async (_event, { folderPath, targetBranch, message, push }) => {
  const data = await buildGitFolderChanges(folderPath, targetBranch);
  if (data.changes.length === 0) {
    const head = await runGit(data.folderPath, ['rev-parse', 'HEAD']);
    return { sha: String(head.stdout || '').trim(), changed: false, count: 0 };
  }

  const cleanMessage = typeof message === 'string' && message.trim() ? message.trim() : 'Обновлены файлы проекта';
  await runGit(data.folderPath, ['add', '--all']);
  await runGit(data.folderPath, ['commit', '-m', cleanMessage]);
  const head = await runGit(data.folderPath, ['rev-parse', 'HEAD']);
  const sha = String(head.stdout || '').trim();

  if (push) {
    await runGit(data.folderPath, ['push', 'origin', `HEAD:${data.targetBranch}`]);
  }

  return { sha, changed: true, count: data.changes.length };
}));

ipcMain.handle('github:search-commits', result(async (_event, { owner, repo, query, author, since, until }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  const params = new URLSearchParams({ per_page: '30' });
  if (query) params.set('q', query);
  if (author) params.set('author', author);
  if (since) params.set('since', since);
  if (until) params.set('until', until);
  return githubRequest(`/repos/${owner}/${repo}/commits?${params}`);
}));

ipcMain.handle('app:select-upload-folder', result(async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Р’С‹Р±РµСЂРёС‚Рµ РїР°РїРєСѓ РїСЂРѕРµРєС‚Р°',
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const dirPath = result.filePaths[0];
  const folderData = await scanUploadFolder(dirPath);
  selectedUploadFolder = folderData;
  return { path: folderData.path, fileCount: folderData.fileCount, totalBytes: folderData.totalBytes, warnings: folderData.warnings };
}));

ipcMain.handle('app:select-release-asset', result(async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Выберите файл релиза',
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const stat = await fs.stat(filePath);
  return { path: filePath, name: path.basename(filePath), size: stat.size };
}));

ipcMain.handle('app:select-download-folder', result(async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Выберите папку для скачиваний',
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}));

ipcMain.handle('app:clear-upload-folder', result(async () => {
  selectedUploadFolder = null;
  return null;
}));

ipcMain.handle('app:copy-text', result(async (_event, value) => {
  if (typeof value !== 'string' || value.length > 10000) throw new Error('Некорректный текст для копирования');
  clipboard.writeText(value);
  return null;
}));

ipcMain.handle('open-external', result(async (_event, url) => {
  if (!isAllowedExternal(url)) throw new Error('Р Р°Р·СЂРµС€РµРЅС‹ С‚РѕР»СЊРєРѕ СЃСЃС‹Р»РєРё github.com');
  await shell.openExternal(url);
  return null;
}));

ipcMain.handle('app:get-current-version', result(async () => {
  return app.getVersion().replace(/\.0$/, '');
}));

ipcMain.handle('app:get-releases', result(async () => {
  const releases = await publicGitHubRequest(`/repos/${GITORA_REPOSITORY}/releases?per_page=20`);
  if (!Array.isArray(releases)) throw new Error('GitHub вернул некорректный список релизов');
  return releases.map(mapRelease);
}));

ipcMain.handle('app:download-release', result(async (_event, { url, fileName, options }) => {
  if (!isAllowedGitHubDownloadUrl(url)) {
    throw new Error('Разрешены только HTTPS-ссылки на GitHub release assets');
  }

  const response = await fetchAllowedGitHubDownload(url);
  if (!response.ok) throw new Error('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєР°С‡Р°С‚СЊ С„Р°Р№Р»');

  const filePath = await resolveDownloadPath(fileName, options);
  if (!filePath) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return filePath;
}));

ipcMain.handle('app:download-archive', result(async (_event, { owner, repo, sha, options }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  if (!isValidGitSha(sha)) throw new Error('Некорректный SHA коммита');

  const { url, headers } = commitArchiveRequest(owner, repo, sha);
  const response = await fetch(url, { headers });

  if (!response.ok) throw new Error('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєР°С‡Р°С‚СЊ Р°СЂС…РёРІ');

  const fileName = `${repo}-${sha.slice(0, 7)}.zip`;
  const filePath = await resolveDownloadPath(fileName, options);
  if (!filePath) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return filePath;
}));
