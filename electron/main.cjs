const { app, BrowserWindow, ipcMain, safeStorage, shell, dialog } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const ignore = require('ignore');
const {
  githubErrorMessage,
  isAllowedGitHubDownloadUrl,
  isValidIssueNumber,
  isValidGitSha,
  isValidGitRef,
  isValidCommitLimit,
} = require('./githubErrors.cjs');
const { createMcpBridge } = require('./mcpBridge.cjs');

const isDev = process.argv.includes('--dev');
const GITHUB_ORIGIN = 'https://github.com';
const API_ORIGIN = 'https://api.github.com';
const REPO_PART = /^[A-Za-z0-9_.-]+$/;

let mainWindow;
let githubToken = null;
let mcpBridge = null;

function tokenPath() {
  return path.join(app.getPath('userData'), 'github-session');
}

async function saveToken(token) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Р—Р°С‰РёС‰С‘РЅРЅРѕРµ С…СЂР°РЅРёР»РёС‰Рµ РћРЎ РЅРµРґРѕСЃС‚СѓРїРЅРѕ');
  }
  const encrypted = safeStorage.encryptString(token).toString('base64');
  await fs.writeFile(tokenPath(), encrypted, { encoding: 'utf8', mode: 0o600 });
}

async function restoreToken() {
  try {
    const encrypted = await fs.readFile(tokenPath(), 'utf8');
    githubToken = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    return githubToken;
  } catch {
    githubToken = null;
    return null;
  }
}

async function clearToken() {
  githubToken = null;
  await fs.rm(tokenPath(), { force: true });
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

async function githubRequest(endpoint, options = {}, token = githubToken) {
  const response = await fetch(`${API_ORIGIN}${endpoint}`, {
    ...options,
    headers: {
      ...githubHeaders(token),
      ...options.headers,
    },
  });

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.ok) return data;

  const remaining = response.headers.get('x-ratelimit-remaining');
  if (response.status === 403 && remaining === '0') {
    throw new Error('Р›РёРјРёС‚ GitHub API РёСЃС‡РµСЂРїР°РЅ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ');
  }
  throw new Error(githubErrorMessage(response.status, data?.message, endpoint, options.method || 'GET'));
}

function validRepo(owner, repo) {
  return REPO_PART.test(owner) && REPO_PART.test(repo);
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

function result(handler) {
  return async (...args) => {
    try {
      return { success: true, data: await handler(...args) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'РќРµРёР·РІРµСЃС‚РЅР°СЏ РѕС€РёР±РєР°' };
    }
  };
}

function isAllowedExternal(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && url.origin === GITHUB_ORIGIN;
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

async function uploadFolderToRepo(owner, repo, folderData) {
  const { files } = folderData;
  if (files.length === 0) return { uploadedCount: 0, skippedCount: 0, status: 'success' };

  const blobShaMap = new Map();
  let uploadedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    try {
      const content = await fs.readFile(file.fullPath);
      const encoding = 'base64';
      const blob = await githubRequest(`/repos/${owner}/${repo}/blobs`, {
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

  const tree = await githubRequest(`/repos/${owner}/${repo}/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tree: treeItems }),
  });

  const commit = await githubRequest(`/repos/${owner}/${repo}/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Initial commit',
      tree: tree.sha,
    }),
  });

  await githubRequest(`/repos/${owner}/${repo}/git/refs/heads/main`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commit.sha, force: true }),
  });

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

app.whenReady().then(async () => {
  await restoreToken();
  try {
    mcpBridge = createMcpBridge({
      metadataPath: path.join(app.getPath('userData'), 'mcp-bridge.json'),
      request: endpoint => githubRequest(endpoint),
    });
    await mcpBridge.start();
  } catch (error) {
    console.error('MCP bridge unavailable:', error);
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  void mcpBridge?.stop();
});

ipcMain.handle('github:login', result(async (_event, token) => {
  const cleanToken = typeof token === 'string' ? token.trim() : '';
  if (!cleanToken) throw new Error('Р’РІРµРґРёС‚Рµ GitHub-С‚РѕРєРµРЅ');
  const user = await githubRequest('/user', {}, cleanToken);
  await saveToken(cleanToken);
  githubToken = cleanToken;
  return user;
}));

ipcMain.handle('github:restore-session', result(async () => {
  if (!githubToken) return null;
  try {
    return await githubRequest('/user');
  } catch (error) {
    await clearToken();
    throw error;
  }
}));

ipcMain.handle('github:logout', result(async () => {
  await clearToken();
  return null;
}));

ipcMain.handle('github:repos', result(async () => (
  githubRequest('/user/repos?per_page=100&sort=updated')
)));

ipcMain.handle('github:repository', result(async (_event, { owner, repo, commitLimit }) => {
  if (!validRepo(owner, repo)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  if (!isValidCommitLimit(commitLimit)) throw new Error('Некорректный лимит коммитов');
  const [commits, branches] = await Promise.all([
    githubRequest(`/repos/${owner}/${repo}/commits?per_page=${commitLimit}`),
    githubRequest(`/repos/${owner}/${repo}/branches?per_page=100`),
  ]);
  return { commits, branches };
}));

ipcMain.handle('github:create-repo', result(async (_event, input) => {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name || !REPO_PART.test(name)) throw new Error('РќРµРєРѕСЂСЂРµРєС‚РЅРѕРµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ');
  const repo = await githubRequest('/user/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: typeof input.description === 'string' ? input.description.trim() : '',
      private: Boolean(input.private),
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
    const uploadResult = await uploadFolderToRepo(owner, repo.name, folderData);
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
    }),
  });

  const assetPath = typeof input?.assetPath === 'string' ? input.assetPath.trim() : '';
  if (!assetPath) return mapRelease(release);

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
  const response = await fetch(`${API_ORIGIN}/repos/${owner}/${repo}/contents/README.md?ref=${encodeURIComponent(ref)}`, {
    headers: githubHeaders(),
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
  const data = await buildFolderChanges(owner, repo, ref, cleanFolderPath);
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

ipcMain.handle('open-external', result(async (_event, url) => {
  if (!isAllowedExternal(url)) throw new Error('Р Р°Р·СЂРµС€РµРЅС‹ С‚РѕР»СЊРєРѕ СЃСЃС‹Р»РєРё github.com');
  await shell.openExternal(url);
  return null;
}));

ipcMain.handle('app:get-current-version', result(async () => {
  return app.getVersion();
}));

ipcMain.handle('app:get-releases', result(async () => {
  const releases = await githubRequest('/repos/Appappars/Gitora/releases?per_page=20');
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

  const url = `${GITHUB_ORIGIN}/${owner}/${repo}/archive/${sha}.zip`;
  const response = await fetch(url, {
    headers: githubToken ? { Authorization: `Bearer ${githubToken}` } : {},
  });

  if (!response.ok) throw new Error('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєР°С‡Р°С‚СЊ Р°СЂС…РёРІ');

  const fileName = `${repo}-${sha.slice(0, 7)}.zip`;
  const filePath = await resolveDownloadPath(fileName, options);
  if (!filePath) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return filePath;
}));
