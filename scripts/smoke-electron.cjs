const { app, BrowserWindow, ipcMain } = require('electron');
const os = require('os');
const path = require('path');

app.setPath('userData', path.join(os.tmpdir(), `gitora-smoke-${process.pid}`));

const user = { login: 'smoke-user', name: 'Smoke User', avatar_url: '' };
const repo = {
  id: 1,
  name: 'smoke-repo',
  full_name: 'smoke-user/smoke-repo',
  private: false,
  description: '',
  stargazers_count: 0,
  forks_count: 0,
  updated_at: '2026-06-21T12:00:00Z',
  default_branch: 'main',
};
const syncedRepo = {
  id: 2,
  name: 'synced-repo',
  full_name: 'smoke-user/synced-repo',
  private: false,
  description: 'Added during sync',
  stargazers_count: 0,
  forks_count: 0,
  updated_at: '2026-07-24T12:00:00Z',
  default_branch: 'main',
};
let repoListCalls = 0;
let lastGitPush = null;
let lastReleaseInput = null;
const commit = (sha, message, date, parents) => ({
  sha,
  commit: { message, author: { name: 'Smoke User', date } },
  author: { login: 'smoke-user', avatar_url: '' },
  parents: parents.map(parent => ({ sha: parent })),
});

ipcMain.handle('github:restore-session', async () => ({ success: true, data: user }));
ipcMain.handle('github:login', async () => ({ success: false, error: 'Disabled in smoke test' }));
ipcMain.handle('github:logout', async () => ({ success: true, data: null }));
ipcMain.handle('github:repos', async () => {
  repoListCalls += 1;
  return { success: true, data: repoListCalls === 2 ? [repo, syncedRepo] : [repo] };
});
ipcMain.handle('github:repository', async () => ({
  success: true,
  data: {
    branches: [
      { name: 'codex-gitora-relise', commit: { sha: 'feature' } },
      { name: 'main', commit: { sha: 'merge' } },
    ],
    commits: [
      commit('merge', 'Merge feature', '2026-06-21T13:00:00Z', ['third', 'feature']),
      commit('third', 'Third commit', '2026-06-21T12:00:00Z', ['second']),
      commit('second', 'Second commit', '2026-06-21T11:00:00Z', ['first']),
      commit('first', 'First commit', '2026-06-21T10:00:00Z', []),
      commit('feature', 'Feature commit', '2026-06-21T09:00:00Z', ['first']),
    ],
  },
}));
ipcMain.handle('github:latest-commit', async () => ({ success: true, data: commit('third', 'Third commit', '2026-06-21T12:00:00Z', ['second']) }));
ipcMain.handle('github:commit-detail', async (_event, { sha }) => {
  const changed = sha === 'third' || sha === 'merge';
  return {
    success: true,
    data: {
      ...commit(sha, sha === 'third' ? 'Third commit' : `${sha} commit`, '2026-06-21T12:00:00Z', []),
      stats: { additions: changed ? 6 : 0, deletions: changed ? 2 : 0, total: changed ? 8 : 0 },
      files: changed ? [{
        filename: 'README.md',
        additions: 6,
        deletions: 2,
        changes: 8,
        status: 'modified',
        patch: '@@ -1,2 +1,6 @@\n-Old README\n+New README\n+\n+Details\n+Gitora',
      }] : [],
    },
  };
});
ipcMain.handle('github:create-repo', async () => ({ success: false, error: 'Disabled in smoke test' }));
ipcMain.handle('github:delete-repo', async () => ({ success: true, data: null }));
ipcMain.handle('github:create-release', async (_event, { input }) => {
  lastReleaseInput = input;
  return { success: true, data: { tag: input.tagName, name: input.name || input.tagName, body: input.body || '', publishedAt: '2026-06-21T12:00:00Z', prerelease: Boolean(input.prerelease), assets: [] } };
});
ipcMain.handle('github:get-readme', async () => ({ success: true, data: '# Smoke repo\n' }));
ipcMain.handle('github:save-readme', async () => ({ success: true, data: { sha: 'readme', changed: true } }));
ipcMain.handle('github:check-folder-changes', async () => ({
  success: true,
  data: {
    folderPath: 'C:\\smoke',
    branch: 'main',
    warnings: [],
    added: 1,
    modified: 0,
    deleted: 0,
    changes: [{ path: 'README.md', status: 'added' }],
  },
}));
ipcMain.handle('github:commit-folder-changes', async () => ({ success: true, data: { sha: 'folder', changed: true, count: 1 } }));
ipcMain.handle('git:check-folder-changes', async () => ({
  success: true,
  data: {
    folderPath: 'C:\\smoke',
    branch: 'main',
    targetBranch: 'main',
    currentBranch: 'main',
    isGitRepository: true,
    warnings: [],
    added: 1,
    modified: 0,
    deleted: 0,
    additions: 6,
    deletions: 2,
    changes: [{ path: 'README.md', status: 'added' }],
  },
}));
ipcMain.handle('git:commit-folder-changes', async (_event, { push }) => {
  lastGitPush = push;
  return {
    success: true,
    data: { sha: push ? 'pushed-folder' : 'local-folder', changed: true, count: 1 },
  };
});
ipcMain.handle('open-external', async () => ({ success: false, error: 'Disabled in smoke test' }));
ipcMain.handle('app:get-current-version', async () => ({ success: true, data: 'smoke' }));
ipcMain.handle('app:get-releases', async () => ({ success: true, data: [] }));
ipcMain.handle('app:download-release', async () => ({ success: false, error: 'Disabled in smoke test' }));
ipcMain.handle('app:download-archive', async () => ({ success: false, error: 'Disabled in smoke test' }));
ipcMain.handle('app:select-upload-folder', async () => ({ success: true, data: { path: 'C:\\smoke', fileCount: 1, totalBytes: 12, warnings: [] } }));
ipcMain.handle('app:select-release-asset', async () => ({ success: true, data: null }));
ipcMain.handle('app:select-download-folder', async () => ({ success: true, data: null }));
ipcMain.handle('app:clear-upload-folder', async () => ({ success: true, data: null }));
ipcMain.handle('app:copy-text', async () => ({ success: true, data: null }));
ipcMain.handle('ai:get-status', async () => ({
  success: true,
  data: {
    level: 'ready',
    label: 'Подключено',
    githubConnected: true,
    githubUser: user.login,
    githubAuth: { user: user.login, authType: 'Fine-grained PAT', tokenSource: 'smoke', permissions: { push: true }, scopes: [], acceptedScopes: [], acceptedPermissions: { contents: 'write' }, repository: repo.full_name, permissionChecks: [] },
    mcpConfig: { configPath: 'C:\\smoke\\mcp.json', loaded: true, server: 'gitora' },
    mcpStartup: { started: true, active: true, pid: 1234, toolsLoaded: 15, client: 'manual', lastHeartbeatAt: new Date().toISOString() },
    mcpClient: { connected: true, session: 'smoke-session' },
    mcpWritesAllowed: false,
    mcpRunning: true,
    mcpServerPath: 'C:\\smoke\\mcp-server.cjs',
    mcpMetadataPath: 'C:\\smoke\\mcp-bridge.json',
    mcpSessionId: 'smoke-session',
    currentRepository: repo.full_name,
    repositoryAvailable: true,
    toolCount: 15,
    tools: ['list_repos', 'get_commits', 'get_branches', 'get_commit_detail', 'search_commits'].map(name => ({ name, label: name, description: '', available: true })),
    client: { id: 'manual', label: 'MCP-клиент', configured: true, requiresRestart: false, configPath: '', supported: true, installed: true, connected: true },
    clients: [],
    configTemplate: '{"mcpServers":{"gitora":{"command":"Gitora.exe","args":["--mcp-server"]}}}',
    activity: [],
  },
}));
ipcMain.handle('ai:diagnostics', async () => ({
  success: true,
  data: {
    level: 'ready',
    checkedAt: new Date().toISOString(),
    steps: [
      { id: 'server-file', label: 'Файл MCP-сервера', status: 'success', detail: 'Найден' },
      { id: 'bridge', label: 'Локальный мост Gitora', status: 'success', detail: 'Работает' },
      { id: 'tools', label: 'MCP-инструменты', status: 'success', detail: '5 доступны' },
      { id: 'github', label: 'GitHub-сессия', status: 'success', detail: 'Подключена' },
      { id: 'repos', label: 'Список репозиториев', status: 'success', detail: 'Доступен' },
      { id: 'repository', label: 'Текущий репозиторий', status: 'success', detail: repo.full_name },
      { id: 'commits', label: 'Ветки и коммиты', status: 'success', detail: 'Доступны' },
      { id: 'commit-detail', label: 'Детали тестового коммита', status: 'success', detail: 'Доступны' },
    ],
    status: {
      level: 'ready', label: 'Подключено', githubAuth: { user: user.login, authType: 'Fine-grained PAT', tokenSource: 'smoke', permissions: { push: true }, scopes: [], acceptedScopes: [], acceptedPermissions: { contents: 'write' }, repository: repo.full_name, permissionChecks: [] }, mcpConfig: { configPath: 'C:\\smoke\\mcp.json', loaded: true, server: 'gitora' }, mcpStartup: { started: true, active: true, pid: 1234, toolsLoaded: 15, client: 'manual', lastHeartbeatAt: new Date().toISOString() }, mcpClient: { connected: true, session: 'smoke-session' }, mcpWritesAllowed: false, mcpRunning: true, mcpServerPath: 'mcp-server.cjs', mcpMetadataPath: 'mcp-bridge.json', mcpSessionId: 'smoke-session', currentRepository: repo.full_name, repositoryAvailable: true, toolCount: 15,
      tools: ['list_repos', 'get_commits', 'get_branches', 'get_commit_detail', 'search_commits'].map(name => ({ name, label: name, description: '', available: true })),
      client: { id: 'manual', label: 'MCP-клиент', configured: true, requiresRestart: false, configPath: '', supported: true, installed: true, connected: true }, clients: [], configTemplate: '{}', activity: [],
    },
  },
}));
ipcMain.handle('ai:configure-client', async () => ({ success: true, data: { client: { id: 'manual', label: 'MCP-клиент', configured: true, requiresRestart: true, configPath: '', supported: true, installed: true, connected: false }, configPath: '', configTemplate: '{}' } }));
ipcMain.handle('ai:disconnect-client', async () => ({ success: true, data: { id: 'manual', label: 'MCP-клиент', configured: false, requiresRestart: false, configPath: '', supported: true, installed: true, connected: false } }));
ipcMain.handle('ai:restart-mcp', async () => ({ success: true, data: { level: 'ready', label: 'Подключено', githubConnected: true, githubAuth: { user: user.login, authType: 'Fine-grained PAT', tokenSource: 'smoke', permissions: { push: true }, scopes: [], acceptedScopes: [], acceptedPermissions: { contents: 'write' }, repository: repo.full_name, permissionChecks: [] }, mcpConfig: { configPath: 'C:\\smoke\\mcp.json', loaded: true, server: 'gitora' }, mcpStartup: { started: true, active: true, pid: 1234, toolsLoaded: 15, client: 'manual', lastHeartbeatAt: new Date().toISOString() }, mcpClient: { connected: true, session: 'smoke-session' }, mcpWritesAllowed: false, mcpRunning: true, currentRepository: repo.full_name, repositoryAvailable: true, toolCount: 15, tools: [], client: { id: 'manual', label: 'MCP-клиент', configured: true, requiresRestart: false, configPath: '', supported: true, installed: true, connected: true }, clients: [], configTemplate: '{}', activity: [] } }));
ipcMain.handle('ai:open-config-folder', async () => ({ success: true, data: null }));

app.whenReady().then(async () => {
  const errors = [];
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, '../electron/preload.cjs'),
    },
  });

  window.webContents.on('console-message', (details) => {
    if (details.level === 'error') errors.push(details.message);
  });

  try {
    await window.loadFile(path.join(__dirname, '../dist/index.html'));
    const state = await window.webContents.executeJavaScript(`
      (async () => {
        const deadline = Date.now() + 5000;
        while (!document.querySelector('button[aria-label^="Third commit"]') && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        const node = document.querySelector('button[aria-label^="Third commit"]');
        const graphSvg = document.querySelector('svg[data-commit-graph]');
        const edge = graphSvg?.querySelector('path');
        [...document.querySelectorAll('button')]
          .find(button => button.textContent?.trim() === 'Настройки')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        [...document.querySelectorAll('[role="tab"]')]
          .find(button => button.textContent?.trim() === 'Интеграции')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const aiModal = document.querySelector('[data-ai-connection-panel]');
        const aiMinimalVisible = Boolean(
          aiModal
          && aiModal.querySelector('#ai-connection-title')?.textContent === 'MCP Gitora'
          && aiModal.querySelector('[data-ai-client="universal"]')
          && !aiModal.querySelector('[data-ai-client="claude"]')
          && !aiModal.querySelector('[data-ai-client="cursor"]')
          && !aiModal.querySelector('[data-ai-client="codex"]')
          && !aiModal.querySelector('[data-ai-technical]')
          && !aiModal.querySelector('[data-mcp-write-guard]')
        );
        const aiCopyWorks = Boolean(
          aiModal?.querySelector('pre')
          && [...aiModal.querySelectorAll('button')].some(button => button.textContent?.includes('Скопировать'))
          && [...aiModal.querySelectorAll('button')].some(button => button.textContent?.includes('Проверить подключение'))
          && !aiModal.querySelector('[data-ai-reconnect]')
        );
        document.querySelector('#settings-title')?.closest('[role="dialog"]')?.querySelector('button[aria-label="Закрыть"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const nodeRect = node?.getBoundingClientRect();
        const edgePoints = graphSvg
          ? [...graphSvg.querySelectorAll('path')].flatMap(path => {
              const start = path.getPointAtLength(0);
              const end = path.getPointAtLength(path.getTotalLength());
              return [{ path, point: start }, { path, point: end }];
            })
          : [];
        const alignmentError = nodeRect && edgePoints.length > 0
          ? Math.min(...edgePoints.map(({ path, point }) => {
              const screenPoint = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM());
              return Math.hypot(
                nodeRect.left + nodeRect.width / 2 - screenPoint.x,
                nodeRect.top + nodeRect.height / 2 - screenPoint.y,
              );
            }))
          : null;
        node?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        document.querySelector('[data-detail-section="stats"] summary')?.click();
        const detailStatsDeadline = Date.now() + 2000;
        while (!document.body.innerText.includes('ФАЙЛЫ') && Date.now() < detailStatsDeadline) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        const detailStatsVisible = document.body.innerText.includes('ФАЙЛЫ')
          && document.body.innerText.includes('ДОБАВЛЕНО')
          && document.body.innerText.includes('УДАЛЕНО');
        const changedFileVisible = Boolean(document.querySelector('[data-changed-file]'));
        const diffVisible = Boolean(document.querySelector('[data-diff-empty]') || document.querySelector('[aria-label^="Diff файла"]'));
        const parseRgb = (color) => {
          const values = color.match(/\\d+(?:\\.\\d+)?/g)?.map(Number) || [];
          return values.slice(0, 3);
        };
        const luminance = (color) => parseRgb(color).reduce((total, value, index) => {
          const channel = value / 255;
          const linear = channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          return total + linear * [0.2126, 0.7152, 0.0722][index];
        }, 0);
        const contrast = (foreground, background) => {
          const foregroundLum = luminance(foreground);
          const backgroundLum = luminance(background);
          return (Math.max(foregroundLum, backgroundLum) + 0.05) / (Math.min(foregroundLum, backgroundLum) + 0.05);
        };
        const effectiveBackground = (element) => {
          const background = getComputedStyle(element).backgroundColor;
          return background.includes('0)') || background === 'transparent'
            ? getComputedStyle(element.parentElement?.parentElement || element).backgroundColor
            : background;
        };
        const diffAddLine = document.querySelector('.diff-add-line');
        const diffDelLine = document.querySelector('.diff-del-line');
        const diffContextLine = document.querySelector('.diff-context-line');
        const diffContrastVisible = Boolean(
          diffAddLine && diffDelLine && diffContextLine
          && contrast(getComputedStyle(diffAddLine).color, effectiveBackground(diffAddLine)) >= 4.5
          && contrast(getComputedStyle(diffDelLine).color, effectiveBackground(diffDelLine)) >= 4.5
          && contrast(getComputedStyle(diffContextLine).color, effectiveBackground(diffContextLine)) >= 4.5
        );
        document.querySelector('[data-detail-section="identity"] summary')?.click();
        await new Promise(resolve => requestAnimationFrame(resolve));
        document.querySelector('[data-copy-sha]')?.click();
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => setTimeout(resolve, 60));
        const shaCopiedVisible = document.body.innerText.includes('Скопировано');
        document.querySelector('[data-detail-section="parents"] summary')?.click();
        await new Promise(resolve => requestAnimationFrame(resolve));
        document.querySelector('[data-parent-sha="second"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const parentNavigationVisible = document.body.innerText.includes('Second commit');
        document.querySelector('button[aria-label^="Third commit"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const horizontalButton = document.querySelector('button[aria-label="Граф слева направо"]');
        horizontalButton?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const horizontalDirectionVisible = horizontalButton?.getAttribute('aria-pressed') === 'true';
        const directionButtons = ['Граф сверху вниз', 'Граф снизу вверх', 'Граф слева направо', 'Граф справа налево']
          .map(label => document.querySelector('button[aria-label="' + label + '"]'));
        const allGraphDirectionsVisible = directionButtons.every(Boolean);
        document.querySelector('button[aria-label="Граф справа налево"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const reverseHorizontalDirectionVisible = document.querySelector('button[aria-label="Граф справа налево"]')?.getAttribute('aria-pressed') === 'true';
        document.querySelector('button[aria-label="Граф снизу вверх"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const reverseVerticalDirectionVisible = document.querySelector('button[aria-label="Граф снизу вверх"]')?.getAttribute('aria-pressed') === 'true';
        const zoomLabel = document.querySelector('[data-graph-zoom]');
        const zoomBefore = zoomLabel?.textContent;
        document.querySelector('button[aria-label="Увеличить масштаб"]')?.click();
        await new Promise(resolve => requestAnimationFrame(resolve));
        const zoomAfter = zoomLabel?.textContent;
        const zoomControlsVisible = Boolean(zoomBefore && zoomAfter && zoomBefore !== zoomAfter);
        const canvas = document.querySelector('[aria-label="Область графа коммитов"] > div[style*="translate"]');
        const transformBeforeCenter = canvas?.getAttribute('style');
        document.querySelector('button[title="Подогнать и центрировать граф"]')?.click();
        await new Promise(resolve => requestAnimationFrame(resolve));
        const transformAfterCenter = canvas?.getAttribute('style');
        const centerControlVisible = Boolean(transformBeforeCenter && transformAfterCenter);
        const filtersButton = document.querySelector('button[title="Фильтры графа"]');
        filtersButton?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const graphFiltersVisible = Boolean(document.querySelector('#graph-filters'));
        const mergeCheckbox = document.querySelector('#graph-filters input[type="checkbox"]');
        mergeCheckbox?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const mergeFilterApplied = Boolean(
          [...document.querySelectorAll('button')].find(button => button.getAttribute('aria-label')?.includes('merge-коммит'))
          && !document.querySelector('button[aria-label^="Third commit"]')
        );
        [...document.querySelectorAll('#graph-filters button')]
          .find(button => button.textContent?.includes('Очистить'))?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const filesCheckbox = document.querySelectorAll('#graph-filters input[type="checkbox"]')[1];
        filesCheckbox?.click();
        const filesFilterDeadline = Date.now() + 2000;
        while (document.querySelector('button[aria-label^="Second commit"]') && Date.now() < filesFilterDeadline) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        const filesFilterApplied = Boolean(
          filesCheckbox?.checked
          && document.querySelector('button[aria-label^="Third commit"]')
          && !document.querySelector('button[aria-label^="Second commit"]')
        );
        filesCheckbox?.click();
        await new Promise(resolve => requestAnimationFrame(resolve));
        filtersButton?.click();
        const panel = document.querySelector('aside[aria-label]');
        const panelBeforeScroll = panel?.getBoundingClientRect();
        window.scrollTo(0, Math.min(500, document.documentElement.scrollHeight));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const panelAfterScroll = panel?.getBoundingClientRect();
        const panelStaysVisible = Boolean(
          panelBeforeScroll
          && panelAfterScroll
          && panelAfterScroll.top >= 65
          && panelAfterScroll.bottom <= innerHeight + 1
          && panelAfterScroll.top <= panelBeforeScroll.top
        );
        const projectMoreTrigger = document.querySelector('button[data-project-more-trigger]');
        projectMoreTrigger?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const projectMoreMenu = document.querySelector('[data-project-more-menu]');
        const projectMoreMenuText = projectMoreMenu?.textContent || '';
        const projectMoreMenuVisible = Boolean(
          projectMoreMenu
          && projectMoreMenuText.includes('Синхронизация')
          && !projectMoreMenuText.includes('Обновить')
          && !projectMoreMenuText.includes('Создать ветку')
          && projectMoreMenuText.includes('Редактировать')
          && projectMoreMenuText.includes('Управление ветками')
          && projectMoreMenuText.includes('Копировать ссылку')
          && projectMoreMenuText.includes('Открыть на GitHub')
        );
        [...document.querySelectorAll('[data-project-more-menu] button')]
          .find(button => button.textContent?.includes('Синхронизация'))?.click();
        const listSyncDeadline = Date.now() + 2000;
        while (!document.body.innerText.includes('synced-repo') && Date.now() < listSyncDeadline) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        const repositoryListUpdated = document.body.innerText.includes('synced-repo');
        const refreshTimestampVisible = document.body.innerText.includes('Обновлено в');

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(resolve => requestAnimationFrame(resolve));

        const projectQuickActionsVisible = Boolean(
          document.querySelector('button[data-project-changes]')
          && document.querySelector('button[data-project-release]')
          && document.querySelector('button[data-project-readme]')
        );
        projectMoreTrigger?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        [...document.querySelectorAll('[data-project-more-menu] button')]
          .find(button => button.textContent?.includes('Управление ветками'))?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const branchDialog = document.querySelector('#branch-title')?.closest('[role="dialog"]');
        const branchRow = branchDialog?.querySelector('[data-branch-row]');
        branchRow?.querySelector('button[aria-haspopup="menu"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const branchMenu = document.querySelector('[role="menu"]');
        const branchMenuText = branchMenu?.textContent || '';
        const branchMenuVisible = Boolean(
          branchMenu
          && branchMenuText.includes('Переключиться на ветку')
          && branchMenuText.includes('Переименовать')
          && branchMenuText.includes('Настроить цвет и сторону')
          && branchMenuText.includes('Открыть на GitHub')
          && branchMenuText.includes('Скопировать название')
          && branchMenuText.includes('Удалить')
        );
        [...document.querySelectorAll('[role="menu"] [role="menuitem"]')]
          .find(button => button.textContent?.includes('Настроить цвет и сторону'))?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const branchVisualSettingsVisible = Boolean(
          document.querySelector('#branch-title-input')
          && document.querySelectorAll('[aria-label^="Цвет ветки:"]').length >= 8
          && document.querySelector('[aria-label="Расположить ветку слева"]')
          && document.querySelector('[aria-label="Автоматическое размещение"]')
          && document.querySelector('[aria-label="Расположить ветку справа"]')
        );
        [...document.querySelectorAll('[role="dialog"] button')]
          .find(button => button.textContent?.trim() === 'Отмена')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        [...document.querySelectorAll('[role="dialog"] button')]
          .find(button => button.textContent?.trim() === 'Создать')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const createBranchModalVisible = Boolean(document.querySelector('#branch-title') && document.querySelector('input[placeholder="feature/my-feature"]'));
        document.querySelector('#branch-title')?.closest('[role="dialog"]')?.querySelector('button[aria-label="Закрыть"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        document.querySelector('button[data-graph-more-trigger]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        [...document.querySelectorAll('[data-graph-more-menu] [role="menuitem"]')]
          .find(button => button.textContent?.includes('Скрыть граф'))?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const graphHiddenVisible = document.body.innerText.includes('Граф скрыт');
        document.querySelector('button[data-graph-more-trigger]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        [...document.querySelectorAll('[data-graph-more-menu] [role="menuitem"]')]
          .find(button => button.textContent?.includes('Показать граф'))?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const graphRestoredVisible = !document.body.innerText.includes('Граф скрыт');

        const searchInput = document.querySelector('input[placeholder="Поиск репозиториев"]');
        const setInputValue = (input, value) => {
          if (!input) return;
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
          setter?.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setInputValue(searchInput, 'synced');
        await new Promise(resolve => setTimeout(resolve, 220));
        const searchFiltersProjects = Boolean(
          document.querySelector('button[data-project-row="2"]')
          && !document.querySelector('button[data-project-row="1"]')
        );
        setInputValue(searchInput, '');
        await new Promise(resolve => setTimeout(resolve, 220));
        const sortSelect = document.querySelector('button[aria-label="Сортировка репозиториев"]');
        sortSelect?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const sortOption = document.querySelector('[role="listbox"][aria-label="Сортировка репозиториев"] [role="option"]');
        const optionTextColor = sortOption ? getComputedStyle(sortOption).color : '';
        const optionBackgroundColor = sortOption ? getComputedStyle(sortOption).backgroundColor : '';
        const darkThemeOptionsReadable = Boolean(
          sortOption
          && optionTextColor !== 'rgb(0, 0, 0)'
          && contrast(optionTextColor, optionBackgroundColor) >= 4.5
        );
        [...document.querySelectorAll('[role="listbox"][aria-label="Сортировка репозиториев"] [role="option"]')]
          .find(option => option.textContent?.includes('По названию A→Z'))?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const sortPreferenceVisible = sortSelect?.textContent?.includes('По названию A→Z') || false;

        document.querySelector('button[data-project-row="2"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        document.querySelector('button[aria-label="Действия для synced-repo"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const menu = document.querySelector('[role="menu"]');
        const menuText = menu?.textContent || '';
        const projectMenuVisible = Boolean(
          menu
          && menuText.includes('Редактировать')
          && menuText.includes('Открыть на GitHub')
          && menuText.includes('Скопировать ссылку')
          && menuText.includes('Удалить с GitHub')
        );
        [...document.querySelectorAll('[role="menuitem"]')]
          .find(button => button.textContent?.includes('Удалить с GitHub'))?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const deleteConfirmVisible = document.body.innerText.includes('Удалить репозиторий с GitHub?')
          && document.body.innerText.includes('synced-repo');
        [...document.querySelectorAll('button')]
          .find(button => button.textContent?.trim() === 'Удалить с GitHub')?.click();
        const deletionDeadline = Date.now() + 2000;
        while (document.body.innerText.includes('synced-repo') && Date.now() < deletionDeadline) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        const deletedRepositoryRemoved = !document.body.innerText.includes('synced-repo');

        [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Настройки'))?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const syncButtonVisible = [...document.querySelectorAll('button')]
          .some(button => button.textContent?.includes('Синхронизировать сейчас'));
        [...document.querySelectorAll('[role="tab"]')]
          .find(button => button.textContent?.trim() === 'Интеграции')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const aiConnectionModalVisible = Boolean(document.querySelector('#ai-connection-title'));
        const aiMinimalSettingsVisible = Boolean(
          document.querySelector('[data-ai-connection-panel] [data-ai-client="universal"]')
          && !document.querySelector('[data-ai-connection-panel] [data-ai-client="claude"]')
          && !document.querySelector('[data-ai-technical]')
          && !document.querySelector('[data-mcp-write-guard]')
        );
        document.querySelector('#settings-title')?.closest('[role="dialog"]')?.querySelector('button[aria-label="Закрыть"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Настройки'))?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        [...document.querySelectorAll('button')]
          .find(button => button.textContent?.includes('Синхронизировать сейчас'))?.click();
        document.querySelector('#settings-title')?.closest('[role="dialog"]')?.querySelector('button[aria-label="Закрыть"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        document.querySelector('button[data-project-release]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const releaseStatusButtons = [...document.querySelectorAll('[data-release-status]')];
        const releaseStatusOptionsVisible = releaseStatusButtons.length === 3
          && releaseStatusButtons.some(button => button.textContent?.includes('Нет'))
          && releaseStatusButtons.some(button => button.textContent?.includes('Предрелизная версия'))
          && releaseStatusButtons.some(button => button.textContent?.includes('Последняя версия'));
        [...document.querySelectorAll('[data-release-status]')]
          .find(button => button.getAttribute('data-release-status') === 'latest')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const releaseDraftField = document.querySelector('[data-release-draft]');
        const latestDisablesDraft = Boolean(releaseDraftField?.disabled && !releaseDraftField.checked);
        const releaseTagField = document.querySelector('input[placeholder="v1.0.0"]');
        const releaseTagSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (releaseTagField && releaseTagSetter) {
          releaseTagSetter.call(releaseTagField, 'v9.9.9');
          releaseTagField.dispatchEvent(new Event('input', { bubbles: true }));
        }
        document.querySelector('#create-release-title')?.closest('[role="dialog"]')?.querySelector('button[type="submit"]')?.click();
        document.querySelector('button[data-project-readme]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const readmeModal = document.querySelector('#readme-title');
        readmeModal?.closest('[role="dialog"]')?.querySelector('button[aria-label="Закрыть"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        document.querySelector('button[data-project-changes]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const changesModal = document.querySelector('#changes-title');
        const folderButton = [...document.querySelectorAll('#changes-title ~ form button')]
          .find(button => button.textContent?.includes('Выбрать папку проекта'));
        folderButton?.click();
        const changesSummaryDeadline = Date.now() + 2000;
        while (!document.querySelector('[data-changes-summary]') && Date.now() < changesSummaryDeadline) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        const changeMessageField = document.querySelector('#commit-message');
        const autoMessage = changeMessageField?.value || '';
        const changeModesAbsent = document.querySelectorAll('[data-change-mode]').length === 0;
        const autoMessageMultiline = autoMessage.includes('\\n');
        const customMessage = 'Обновить документацию\\n\\nДобавить подробное описание изменений.\\n  Сохранить отступы.';
        const messageSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (changeMessageField && messageSetter) {
          messageSetter.call(changeMessageField, customMessage);
          changeMessageField.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await new Promise(resolve => requestAnimationFrame(resolve));
        document.querySelector('button[type="submit"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const changeConfirmationVisible = Boolean(document.querySelector('[data-change-confirmation]'));
        const changeMessagePreserved = document.querySelector('[data-change-confirmation]')?.textContent?.includes('Сохранить отступы.') || false;
        [...document.querySelectorAll('[data-change-confirmation] button')]
          .find(button => button.textContent?.includes('Подтвердить'))?.click();
        return {
        title: document.title,
        rootChildren: document.querySelector('#root')?.childElementCount ?? 0,
        hasGitora: document.body.innerText.toLowerCase().includes('gitora'),
        graphVisible: Boolean(node && edge),
        aiMinimalVisible,
        aiCopyWorks,
        alignmentError,
        detailStatsVisible,
        changedFileVisible,
        diffVisible,
        diffContrastVisible,
        shaCopiedVisible,
        parentNavigationVisible,
        horizontalDirectionVisible,
        allGraphDirectionsVisible,
        reverseHorizontalDirectionVisible,
        reverseVerticalDirectionVisible,
        zoomControlsVisible,
        centerControlVisible,
        graphFiltersVisible,
        mergeFilterApplied,
        filesFilterApplied,
        panelStaysVisible,
        refreshTimestampVisible,
          projectMoreMenuVisible,
          projectQuickActionsVisible,
          branchMenuVisible,
          branchVisualSettingsVisible,
          createBranchModalVisible,
          graphHiddenVisible,
          graphRestoredVisible,
          repositoryListUpdated,
        searchFiltersProjects,
        sortPreferenceVisible,
        darkThemeOptionsReadable,
        projectMenuVisible,
        deleteConfirmVisible,
        deletedRepositoryRemoved,
          syncButtonVisible,
        aiConnectionModalVisible,
          aiMinimalSettingsVisible,
          releaseStatusOptionsVisible,
          latestDisablesDraft,
          readmeModalVisible: Boolean(readmeModal),
          changesModalVisible: Boolean(changesModal),
          changeConfirmationVisible,
          changeModesAbsent,
          autoMessageMultiline,
          changeMessagePreserved,
        panelBeforeTop: panelBeforeScroll?.top ?? null,
        panelAfterTop: panelAfterScroll?.top ?? null
        };
      })()
    `);

    const releaseDeadline = Date.now() + 2000;
    while (!lastReleaseInput && Date.now() < releaseDeadline) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    state.latestReleasePayload = lastReleaseInput?.makeLatest === 'true'
      && lastReleaseInput?.prerelease === false
      && lastReleaseInput?.draft === false;
    const pushDeadline = Date.now() + 2000;
    while (lastGitPush !== true && Date.now() < pushDeadline) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    state.pushConfirmed = lastGitPush === true;

    window.setSize(500, 700);
    await new Promise(resolve => setTimeout(resolve, 120));
    const mobileState = await window.webContents.executeJavaScript(`
      (async () => {
        document.querySelector('#changes-title')?.closest('[role="dialog"]')?.querySelector('button[aria-label="Закрыть"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        document.querySelector('button[aria-label^="Third commit"]')?.click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const panel = document.querySelector('aside[aria-label="Детали коммита"]');
        const parent = panel?.parentElement;
        return {
          detailPanelPosition: panel ? getComputedStyle(panel).position : null,
          detailPanelParentDirection: parent ? getComputedStyle(parent).flexDirection : null,
        };
      })()
    `);
    state.mobileDetailInFlow = mobileState.detailPanelPosition === 'static'
      && mobileState.detailPanelParentDirection === 'column';
    state.mobileDetailPosition = mobileState.detailPanelPosition;
    state.mobileDetailParentDirection = mobileState.detailPanelParentDirection;

    if (
      !state.rootChildren
      || !state.hasGitora
      || !state.graphVisible
      || !state.aiMinimalVisible
      || !state.aiCopyWorks
      || state.alignmentError === null
      || state.alignmentError > 0.5
      || !state.detailStatsVisible
      || !state.changedFileVisible
      || !state.diffVisible
      || !state.diffContrastVisible
      || !state.shaCopiedVisible
      || !state.parentNavigationVisible
      || !state.horizontalDirectionVisible
      || !state.allGraphDirectionsVisible
      || !state.reverseHorizontalDirectionVisible
      || !state.reverseVerticalDirectionVisible
      || !state.zoomControlsVisible
      || !state.centerControlVisible
      || !state.graphFiltersVisible
      || !state.mergeFilterApplied
      || !state.filesFilterApplied
      || !state.mobileDetailInFlow
      || !state.panelStaysVisible
      || !state.refreshTimestampVisible
      || !state.repositoryListUpdated
      || !state.searchFiltersProjects
      || !state.sortPreferenceVisible
      || !state.darkThemeOptionsReadable
      || !state.projectMenuVisible
      || !state.projectQuickActionsVisible
      || !state.createBranchModalVisible
      || !state.branchMenuVisible
      || !state.branchVisualSettingsVisible
      || !state.deleteConfirmVisible
      || !state.deletedRepositoryRemoved
      || !state.syncButtonVisible
      || !state.aiConnectionModalVisible
      || !state.aiMinimalSettingsVisible
      || !state.releaseStatusOptionsVisible
      || !state.latestDisablesDraft
      || !state.latestReleasePayload
      || !state.readmeModalVisible
      || !state.changesModalVisible
      || !state.changeConfirmationVisible
      || !state.changeModesAbsent
      || !state.autoMessageMultiline
      || !state.changeMessagePreserved
      || !state.pushConfirmed
      || errors.length
    ) {
      throw new Error(JSON.stringify({ state, errors }));
    }
    console.log(JSON.stringify(state));
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
