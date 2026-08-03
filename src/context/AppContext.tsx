import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AiClientId,
  AiClientStatus,
  AiClientSetupResult,
  AiConnectionStatus,
  AiDiagnosticsResult,
  McpWriteStatus,
  Branch,
  Commit,
  CommitDetails,
  CommitResult,
  CreateReleaseInput,
  CreateRepositoryResult,
  DownloadOptions,
  FolderChangesSummary,
  GitFolderChangesSummary,
  GitHubCommit,
  GitHubIssue,
  GitHubPR,
  GitHubRepo,
  GitHubUser,
  Project,
  Release,
  ReleaseAssetSelection,
  UploadFolderSummary,
  BranchDirection,
} from '../types';
import { computeGraphLayout, GraphLayoutResult } from '../lib/graphLayout';
import { mapCommitDetails } from '../lib/commitDetails';
import { applyThemePreference, readThemePreference } from '../lib/theme';
import { connectionError, ConnectionErrorInfo } from '../lib/connectionErrors';
import {
  mergeBranchPreferences,
  migrateBranchPreference,
  removeBranchPreference,
  updateBranchPreference,
} from '../lib/branchPreferences';

interface AppState {
  project: Project | null;
  selectedCommit: Commit | null;
  commitStatsLoading: boolean;
  branchFilter: string;
  mobileOpen: boolean;
  createOpen: boolean;
  editOpen: boolean;
  branchOpen: boolean;
  settingsOpen: boolean;
  loginOpen: boolean;
  updatesOpen: boolean;
  releaseOpen: boolean;
  readmeOpen: boolean;
  changesOpen: boolean;
  toast: string;
  projects: Project[];
  commits: Commit[];
  branches: Branch[];
  repositoryEmpty: boolean;
  user: GitHubUser | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
  graphLayout: GraphLayoutResult | null;
  lastUpdatedAt: string | null;
  releases: Release[];
  currentVersion: string;
  connectionError: ConnectionErrorInfo | null;
  aiOpen: boolean;
  aiStatus: AiConnectionStatus;
  aiDiagnostics: AiDiagnosticsResult | null;
  aiDiagnosticsLoading: boolean;
}

interface AppContextType extends AppState {
  setProject: (project: Project | null) => void;
  setSelectedCommit: (commit: Commit | null) => void;
  setBranchFilter: (filter: string) => void;
  setMobileOpen: (open: boolean) => void;
  setCreateOpen: (open: boolean) => void;
  setEditOpen: (open: boolean) => void;
  setBranchOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setLoginOpen: (open: boolean) => void;
  setUpdatesOpen: (open: boolean) => void;
  setReleaseOpen: (open: boolean) => void;
  setReadmeOpen: (open: boolean) => void;
  setChangesOpen: (open: boolean) => void;
  setAiOpen: (open: boolean) => void;
  notify: (text: string) => void;
  login: (token: string) => Promise<void>;
  clearConnectionError: () => void;
  logout: () => Promise<void>;
  createRepo: (name: string, description: string, isPrivate: boolean, folderPath?: string) => Promise<CreateRepositoryResult | null>;
  deleteRepo: (owner: string, repo: string) => Promise<boolean>;
  updateRepo: (owner: string, repo: string, data: { name?: string; description?: string; private?: boolean }) => Promise<boolean>;
  createBranch: (owner: string, repo: string, name: string, fromSha: string) => Promise<boolean>;
  deleteBranch: (owner: string, repo: string, branch: string) => Promise<boolean>;
  renameBranch: (owner: string, repo: string, branch: string, newName: string) => Promise<boolean>;
  updateBranchVisualSettings: (branchName: string, changes: { color?: string; direction?: BranchDirection }) => void;
  pullRequests: GitHubPR[];
  selectedPR: GitHubPR | null;
  setSelectedPR: (pr: GitHubPR | null) => void;
  prOpen: boolean;
  setPrOpen: (open: boolean) => void;
  loadPullRequests: (owner: string, repo: string, state?: 'open' | 'closed' | 'all') => Promise<void>;
  getPullRequest: (owner: string, repo: string, number: number) => Promise<GitHubPR | null>;
  createPullRequest: (owner: string, repo: string, title: string, body: string, head: string, base: string) => Promise<boolean>;
  issues: GitHubIssue[];
  selectedIssue: GitHubIssue | null;
  setSelectedIssue: (issue: GitHubIssue | null) => void;
  issueOpen: boolean;
  setIssueOpen: (open: boolean) => void;
  loadIssues: (owner: string, repo: string, state?: 'open' | 'closed' | 'all') => Promise<void>;
  getIssue: (owner: string, repo: string, number: number) => Promise<GitHubIssue | null>;
  createIssue: (owner: string, repo: string, title: string, body: string, labels?: string[]) => Promise<boolean>;
  createRelease: (owner: string, repo: string, input: CreateReleaseInput) => Promise<boolean>;
  getReadme: (owner: string, repo: string, branch: string) => Promise<string>;
  saveReadme: (owner: string, repo: string, branch: string, content: string, message: string) => Promise<boolean>;
  checkFolderChanges: (owner: string, repo: string, branch: string, folderPath: string) => Promise<FolderChangesSummary | null>;
  commitFolderChanges: (owner: string, repo: string, branch: string, folderPath: string, message: string) => Promise<CommitResult | null>;
  searchCommits: (owner: string, repo: string, query: string, author?: string, since?: string, until?: string) => Promise<GitHubCommit[]>;
  getLatestCommit: (owner: string, repo: string) => Promise<GitHubCommit | null>;
  loadCommitDetail: (sha: string) => Promise<CommitDetails | null>;
  loadCommitDetails: (shas: string[]) => Promise<void>;
  checkGitFolderChanges: (folderPath: string, targetBranch: string) => Promise<GitFolderChangesSummary | null>;
  commitGitFolderChanges: (folderPath: string, targetBranch: string, message: string, push: boolean) => Promise<CommitResult | null>;
  selectUploadFolder: () => Promise<UploadFolderSummary | null>;
  selectReleaseAsset: () => Promise<ReleaseAssetSelection | null>;
  clearUploadFolder: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  loadReleases: () => Promise<void>;
  downloadRelease: (url: string, fileName: string) => Promise<string | null>;
  downloadArchive: (owner: string, repo: string, sha: string) => Promise<string | null>;
  refreshRepositoryData: () => Promise<boolean>;
  syncAllData: () => Promise<boolean>;
  refreshAiStatus: () => Promise<AiConnectionStatus | null>;
  runAiDiagnostics: () => Promise<AiDiagnosticsResult | null>;
  configureAiClient: (client: AiClientId) => Promise<AiClientSetupResult | null>;
  disconnectAiClient: (client: AiClientId) => Promise<AiClientStatus | null>;
  restartMcp: () => Promise<AiConnectionStatus | null>;
  allowMcpWrites: () => Promise<McpWriteStatus | null>;
  revokeMcpWrites: () => Promise<McpWriteStatus | null>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const PROJECT_COLORS = ['#AEA989', '#8E7CA3', '#C58C75', '#5D7659'];

function readDownloadOptions(): DownloadOptions {
  try {
    const settings = JSON.parse(localStorage.getItem('gitora-settings') || '{}') as {
      downloadMode?: DownloadOptions['mode'];
      downloadDirectory?: string;
    };
    return {
      mode: settings.downloadMode || 'downloads',
      directory: settings.downloadDirectory || '',
    };
  } catch {
    return { mode: 'downloads', directory: '' };
  }
}

function readCommitLimit(): number {
  try {
    const settings = JSON.parse(localStorage.getItem('gitora-settings') || '{}') as { commitLimit?: number };
    const commitLimit = settings.commitLimit;
    return typeof commitLimit === 'number' && Number.isInteger(commitLimit) && commitLimit >= 25 && commitLimit <= 100
      ? commitLimit
      : 50;
  } catch {
    return 50;
  }
}

const AI_TOOL_NAMES = [
  ['list_repos', 'Список репозиториев', 'Показывает доступные GitHub-репозитории.', true],
  ['get_commits', 'История коммитов', 'Возвращает коммиты выбранного репозитория.', true],
  ['get_branches', 'Ветки', 'Показывает ветки и их последние коммиты.', true],
  ['get_commit_detail', 'Детали коммита', 'Показывает файлы, additions и deletions.', true],
  ['search_commits', 'Поиск коммитов', 'Ищет коммиты по сообщению или автору.', true],
  ['create_repo_file', 'Первый файл репозитория', 'Создаёт файл и первый commit в пустом репозитории.', false],
  ['create_issue', 'Создать Issue', 'Создаёт Issue в репозитории.', false],
  ['add_issue_comment', 'Комментарий к Issue/PR', 'Добавляет комментарий к Issue или Pull Request.', false],
  ['create_pull_request', 'Создать Pull Request', 'Создаёт Pull Request в репозитории.', false],
  ['get_git_commit_object', 'Git-объект commit', 'Читает raw commit object и SHA дерева.', true],
  ['create_git_blob', 'Git blob', 'Создаёт объект содержимого файла.', false],
  ['create_git_tree', 'Git tree', 'Создаёт дерево файлов.', false],
  ['create_git_commit', 'Git commit', 'Создаёт commit в репозитории.', false],
  ['create_git_branch', 'Создать ветку', 'Создаёт ветку от SHA коммита.', false],
  ['update_git_branch', 'Переместить ветку', 'Перемещает ветку на другой SHA без force push.', false],
] as const;

const DEFAULT_AI_STATUS: AiConnectionStatus = {
  level: 'not_configured',
  label: 'Не настроено',
  githubConnected: false,
  githubAuth: { user: '', authType: 'None', tokenSource: 'none', permissions: {}, scopes: [], acceptedScopes: [], acceptedPermissions: {}, repository: '', permissionChecks: [] },
  mcpConfig: { configPath: '—', loaded: false, server: 'manual client' },
  mcpStartup: { started: false, pid: 0, toolsLoaded: 0 },
  mcpClient: { connected: false, session: '' },
  mcpWritesAllowed: false,
  mcpRunning: false,
  mcpServerPath: 'Встроенный сервер Gitora',
  mcpMetadataPath: '—',
  mcpSessionId: '',
  currentRepository: '',
  repositoryAvailable: false,
  toolCount: AI_TOOL_NAMES.length,
  tools: AI_TOOL_NAMES.map(([name, label, description, readOnly]) => ({ name, label, description, readOnly, available: false })),
  client: { id: 'manual', label: 'MCP-клиент', configured: false, requiresRestart: false, configPath: '', supported: true, installed: true, connected: false },
  clients: [],
  configTemplate: JSON.stringify({ mcpServers: { gitora: { command: 'Gitora', args: ['--mcp-server'] } } }, null, 2),
  activity: [],
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};

function mapProjects(repos: GitHubRepo[]): Project[] {
  return repos.map((repo, index) => ({
    id: String(repo.id),
    name: repo.name,
    repo: repo.full_name,
    color: PROJECT_COLORS[index % PROJECT_COLORS.length],
    commits: 0,
    branches: 0,
    updated: new Date(repo.updated_at).toLocaleDateString('ru-RU'),
    updatedAt: repo.updated_at,
    description: repo.description || '',
    isPrivate: repo.private,
    defaultBranch: repo.default_branch || 'main',
  }));
}

function mapCommits(data: GitHubCommit[], layout: GraphLayoutResult): Commit[] {
  const commitBySha = new Map(data.map(commit => [commit.sha, commit]));
  return layout.nodes.map((node, index) => {
    const details = mapCommitDetails(commitBySha.get(node.sha));
    return {
      id: node.sha,
      x: node.x,
      y: node.y,
      lane: node.lane,
      row: node.row,
      branch: node.branch,
      label: node.message,
      author: node.author,
      time: node.date,
      hash: node.sha.slice(0, 7),
      text: commitBySha.get(node.sha)?.commit.message ?? node.message,
      files: details?.files ?? 0,
      plus: details?.plus ?? 0,
      minus: details?.minus ?? 0,
      changeStats: details,
      filesChanged: details?.filesChanged,
      statsStatus: details ? 'loaded' : 'idle',
      merge: node.isMerge,
      current: index === 0,
      parents: node.parents,
    };
  });
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
  const [commitStatsLoading, setCommitStatsLoading] = useState(false);
  const [branchFilter, setBranchFilter] = useState('all');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [readmeOpen, setReadmeOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [repositoryEmpty, setRepositoryEmpty] = useState(false);
  const [repositoryCommits, setRepositoryCommits] = useState<GitHubCommit[]>([]);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphLayout, setGraphLayout] = useState<GraphLayoutResult | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [currentVersion, setCurrentVersion] = useState('0.2');
  const [connectionFailure, setConnectionFailure] = useState<ConnectionErrorInfo | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiConnectionStatus>(DEFAULT_AI_STATUS);
  const [aiDiagnostics, setAiDiagnostics] = useState<AiDiagnosticsResult | null>(null);
  const [aiDiagnosticsLoading, setAiDiagnosticsLoading] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const requestId = useRef(0);
  const initialized = useRef(false);
  const mcpConnecting = useRef(false);
  const projectRef = useRef<Project | null>(null);
  const commitStatsCache = useRef(new Map<string, CommitDetails>());
  const commitStatsRequests = useRef(new Map<string, Promise<CommitDetails | null>>());
  projectRef.current = project;

  const notify = (text: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  };

  const showError = (message?: string) => {
    setError(message || 'Неизвестная ошибка');
    window.setTimeout(() => setError(null), 5000);
  };

  const showConnectionError = (errorCode?: string, message?: string) => {
    setConnectionFailure(connectionError(errorCode, message));
  };

  const clearConnectionError = () => setConnectionFailure(null);

  const refreshAiStatus = async (): Promise<AiConnectionStatus | null> => {
    try {
      const result = await window.electronAPI?.app.getAiStatus();
      if (result?.success && result.data) {
        const mcpReady = result.data.mcpClient.connected || result.data.tools.some(tool => tool.available);
        if (mcpReady) mcpConnecting.current = false;
        const status = mcpReady
          ? { ...result.data, level: 'ready' as const, label: 'Подключено' }
          : mcpConnecting.current
            ? { ...result.data, level: 'attention' as const, label: 'Подключение...' }
            : result.data;
        setAiStatus(status);
        return status;
      }
    } catch {
      // Состояние ИИ не должно блокировать GitHub, граф или загрузку репозитория.
    }
    return null;
  };

  const runAiDiagnostics = async (): Promise<AiDiagnosticsResult | null> => {
    if (!window.electronAPI) {
      notify('Диагностика доступна в приложении Gitora');
      return null;
    }
    setAiDiagnosticsLoading(true);
    const [owner, repo] = projectRef.current?.repo.split('/') || [];
    const result = await window.electronAPI.app.runAiDiagnostics(owner, repo, commits[0]?.id);
    setAiDiagnosticsLoading(false);
    if (result.success && result.data) {
      setAiDiagnostics(result.data);
      setAiStatus(result.data.status);
      return result.data;
    }
    notify(result.error || 'Не удалось выполнить диагностику подключения к ИИ');
    return null;
  };

  const configureAiClient = async (client: AiClientId): Promise<AiClientSetupResult | null> => {
    if (!window.electronAPI) {
      notify('Подключение MCP доступно в приложении Gitora');
      return null;
    }
    const result = await window.electronAPI?.app.configureAiClient(client);
    if (result?.success && result.data) {
      setAiStatus(current => ({
        ...current,
        client: result.data!.client,
        configTemplate: result.data!.configTemplate,
        level: 'attention',
        label: 'Ожидает MCP-сессию — подключить сейчас',
      }));
      notify(result.data.backupPath ? 'Конфигурация обновлена. Резервная копия создана.' : 'Конфигурация ИИ подготовлена');
      return result.data;
    }
    notify(result?.error || 'Не удалось настроить ИИ-клиент');
    return null;
  };

  const disconnectAiClient = async (client: AiClientId): Promise<AiClientStatus | null> => {
    const result = await window.electronAPI?.app.disconnectAiClient(client);
    if (result?.success && result.data) {
      await refreshAiStatus();
      notify(`${result.data.label}: Gitora отключена`);
      return result.data;
    }
    notify(result?.error || 'Не удалось отключить Gitora');
    return null;
  };

  const restartMcp = async (): Promise<AiConnectionStatus | null> => {
    mcpConnecting.current = true;
    setAiStatus(current => ({ ...current, level: 'attention', label: 'Подключение...' }));
    const result = await window.electronAPI?.app.restartMcp();
    if (result?.success && result.data) {
      let latest = result.data;
      const deadline = Date.now() + 30_000;
      while (!(latest.mcpClient.connected || latest.tools.some(tool => tool.available)) && Date.now() < deadline) {
        await new Promise(resolve => window.setTimeout(resolve, 500));
        const refreshed = await refreshAiStatus();
        if (refreshed) latest = refreshed;
      }
      mcpConnecting.current = false;
      const finalStatus = await refreshAiStatus();
      if (finalStatus) latest = finalStatus;
      setAiStatus(latest);
      notify(latest.mcpClient.connected || latest.tools.some(tool => tool.available)
        ? 'MCP подключён без перезапуска ИИ-клиента'
        : 'Bridge обновлён, но MCP-клиент пока не подключился');
      return latest;
    }
    mcpConnecting.current = false;
    await refreshAiStatus();
    notify(result?.error || 'Не удалось перезапустить MCP-мост');
    return null;
  };

  const allowMcpWrites = async (): Promise<McpWriteStatus | null> => {
    const result = await window.electronAPI?.app.allowMcpWrites();
    if (result?.success && result.data) {
      setAiStatus(current => ({ ...current, ...result.data }));
      notify('Запись MCP разрешена на 10 минут');
      return result.data;
    }
    notify(result?.error || 'Не удалось разрешить запись MCP');
    return null;
  };

  const revokeMcpWrites = async (): Promise<McpWriteStatus | null> => {
    const result = await window.electronAPI?.app.revokeMcpWrites();
    if (result?.success && result.data) {
      setAiStatus(current => ({ ...current, ...result.data }));
      notify('Запись MCP отключена');
      return result.data;
    }
    notify(result?.error || 'Не удалось отключить запись MCP');
    return null;
  };

  const loadRepos = async () => {
    const result = await window.electronAPI?.github.getRepos();
    if (!result?.success || !result.data) {
      showConnectionError(result?.errorCode, result?.error || 'Не удалось загрузить репозитории');
      return;
    }
    clearConnectionError();
    const nextProjects = mapProjects(result.data);
    setProjects(nextProjects);
    setProject(current => current
      ? nextProjects.find(item => item.id === current.id) ?? nextProjects[0] ?? null
      : nextProjects[0] ?? null);
  };

  const login = async (token: string) => {
    if (!window.electronAPI) {
      showError('Авторизация доступна в приложении Gitora');
      return;
    }
    setLoading(true);
    setError(null);
    const result = await window.electronAPI.github.login(token);
    if (result.success && result.data) {
      setUser(result.data);
      setConnected(true);
      clearConnectionError();
      setLoginOpen(false);
      await loadRepos();
    } else {
      showConnectionError(result.errorCode, result.error || 'Не удалось подключить GitHub');
    }
    setLoading(false);
  };

  const logout = async () => {
    await window.electronAPI?.github.logout();
    requestId.current += 1;
    setConnected(false);
    setUser(null);
    setProjects([]);
    setProject(null);
    setCommits([]);
    setBranches([]);
    setRepositoryEmpty(false);
    setSelectedCommit(null);
    commitStatsCache.current.clear();
    commitStatsRequests.current.clear();
    setCommitStatsLoading(false);
    setGraphLayout(null);
    setLastUpdatedAt(null);
    setConnectionFailure(null);
    notify('GitHub отключён');
  };

  const createRepo = async (name: string, description: string, isPrivate: boolean, folderPath?: string): Promise<CreateRepositoryResult | null> => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.github.createRepo(name, description, isPrivate, folderPath);
      if (!result?.success || !result.data) {
        showError(result?.error || 'Не удалось создать репозиторий');
        return null;
      }
      const data = result.data;
      if (data.uploadStatus === 'error') {
        showError(`Репозиторий создан, но загрузка файлов завершилась ошибкой`);
      } else if (data.uploadStatus === 'partial') {
        notify(`Проект создан. Загружено ${data.uploadedCount}, пропущено ${data.skippedCount}`);
      } else if (data.uploadStatus === 'success') {
        notify(`Проект «${name}» создан с ${data.uploadedCount} файлами`);
      } else {
        notify(`Проект «${name}» создан в GitHub`);
      }
      await loadRepos();
      return data;
    } finally {
      setLoading(false);
    }
  };

  const deleteRepo = async (owner: string, repo: string): Promise<boolean> => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.github.deleteRepo(owner, repo);
      if (!result?.success) {
        showError(result?.error || 'Не удалось удалить репозиторий');
        return false;
      }
      notify('Репозиторий удалён');
      await loadRepos();
      return true;
    } finally {
      setLoading(false);
    }
  };

  const updateRepo = async (owner: string, repo: string, data: { name?: string; description?: string; private?: boolean }): Promise<boolean> => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.github.updateRepo(owner, repo, data);
      if (!result?.success || !result.data) {
        showError(result?.error || 'Не удалось обновить репозиторий');
        return false;
      }
      notify('Репозиторий обновлён');
      await loadRepos();
      return true;
    } finally {
      setLoading(false);
    }
  };

  const createBranch = async (owner: string, repo: string, name: string, fromSha: string): Promise<boolean> => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.github.createBranch(owner, repo, name, fromSha);
      if (!result?.success) {
        showError(result?.error || 'Не удалось создать ветку');
        return false;
      }
      notify(`Ветка «${name}» создана`);
      await refreshRepositoryData();
      return true;
    } finally {
      setLoading(false);
    }
  };

  const deleteBranch = async (owner: string, repo: string, branch: string): Promise<boolean> => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.github.deleteBranch(owner, repo, branch);
      if (!result?.success) {
        showError(result?.error || 'Не удалось удалить ветку');
        return false;
      }
      removeBranchPreference(`${owner}/${repo}`, branch);
      notify(`Ветка «${branch}» удалена`);
      await refreshRepositoryData();
      return true;
    } finally {
      setLoading(false);
    }
  };

  const renameBranch = async (owner: string, repo: string, branch: string, newName: string): Promise<boolean> => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.github.renameBranch(owner, repo, branch, newName);
      if (!result?.success) {
        showError(result?.error || 'Не удалось переименовать ветку');
        return false;
      }
      migrateBranchPreference(`${owner}/${repo}`, branch, newName);
      notify(`Ветка переименована в «${newName}»`);
      await refreshRepositoryData();
      return true;
    } finally {
      setLoading(false);
    }
  };

  const updateBranchVisualSettings = (branchName: string, changes: { color?: string; direction?: BranchDirection }) => {
    if (!project) return;
    updateBranchPreference(project.repo, branchName, changes);
    setBranches(current => {
      const nextBranches = current.map(branch => branch.name === branchName
        ? { ...branch, ...changes }
        : branch);
      if (nextBranches.every((branch, index) => branch === current[index])) return current;
      if (repositoryCommits.length) {
        const layout = computeGraphLayout(repositoryCommits, nextBranches);
        setGraphLayout(layout);
        setCommits(mapCommits(repositoryCommits, layout));
      } else if (graphLayout) {
        setGraphLayout({
          ...graphLayout,
          branchColors: Object.fromEntries(nextBranches.map(branch => [branch.name, branch.color])),
        });
      }
      return nextBranches;
    });
  };

  const [pullRequests, setPullRequests] = useState<GitHubPR[]>([]);
  const [selectedPR, setSelectedPR] = useState<GitHubPR | null>(null);
  const [prOpen, setPrOpen] = useState(false);

  const loadPullRequests = async (owner: string, repo: string, state?: 'open' | 'closed' | 'all') => {
    const result = await window.electronAPI?.github.getPullRequests(owner, repo, state);
    if (result?.success && result.data) {
      setPullRequests(result.data);
    }
  };

  const getPullRequest = async (owner: string, repo: string, number: number): Promise<GitHubPR | null> => {
    const result = await window.electronAPI?.github.getPullRequest(owner, repo, number);
    if (result?.success && result.data) {
      return result.data;
    }
    return null;
  };

  const createPullRequest = async (owner: string, repo: string, title: string, body: string, head: string, base: string): Promise<boolean> => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.github.createPullRequest(owner, repo, title, body, head, base);
      if (!result?.success) {
        showError(result?.error || 'Не удалось создать pull request');
        return false;
      }
      notify('Pull request создан');
      await loadPullRequests(owner, repo);
      return true;
    } finally {
      setLoading(false);
    }
  };

  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);

  const loadIssues = async (owner: string, repo: string, state?: 'open' | 'closed' | 'all') => {
    const result = await window.electronAPI?.github.getIssues(owner, repo, state);
    if (result?.success && result.data) {
      setIssues(result.data.filter(issue => !issue.pull_request));
    }
  };

  const getIssue = async (owner: string, repo: string, number: number): Promise<GitHubIssue | null> => {
    const result = await window.electronAPI?.github.getIssue(owner, repo, number);
    if (result?.success && result.data) {
      return result.data;
    }
    return null;
  };

  const createIssue = async (owner: string, repo: string, title: string, body: string, labels?: string[]): Promise<boolean> => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.github.createIssue(owner, repo, title, body, labels);
      if (!result?.success) {
        showError(result?.error || 'Не удалось создать задачу');
        return false;
      }
      notify('Задача создана');
      await loadIssues(owner, repo);
      return true;
    } finally {
      setLoading(false);
    }
  };

  const createRelease = async (owner: string, repo: string, input: CreateReleaseInput): Promise<boolean> => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.github.createRelease(owner, repo, input);
      if (!result?.success) {
        showError(result?.error || 'Не удалось создать релиз');
        return false;
      }
      notify(`Релиз «${input.tagName}» создан`);
      return true;
    } finally {
      setLoading(false);
    }
  };

  const getReadme = async (owner: string, repo: string, branch: string): Promise<string> => {
    const result = await window.electronAPI?.github.getReadme(owner, repo, branch);
    if (result?.success) return result.data ?? '';
    showError(result?.error || 'Не удалось загрузить README');
    return '';
  };

  const saveReadme = async (owner: string, repo: string, branch: string, content: string, message: string): Promise<boolean> => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.github.saveReadme(owner, repo, branch, content, message);
      if (!result?.success || !result.data) {
        showError(result?.error || 'Не удалось сохранить README');
        return false;
      }
      notify(result.data.changed ? 'README сохранён' : 'README без изменений');
      if (result.data.changed) await refreshRepositoryData();
      return true;
    } finally {
      setLoading(false);
    }
  };

  const checkFolderChanges = async (owner: string, repo: string, branch: string, folderPath: string): Promise<FolderChangesSummary | null> => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.github.checkFolderChanges(owner, repo, branch, folderPath);
      if (result?.success && result.data) return result.data;
      showError(result?.error || 'Не удалось проверить изменения');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const commitFolderChanges = async (owner: string, repo: string, branch: string, folderPath: string, message: string): Promise<CommitResult | null> => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.github.commitFolderChanges(owner, repo, branch, folderPath, message);
      if (!result?.success || !result.data) {
        showError(result?.error || 'Не удалось отправить коммит');
        return null;
      }
      notify(result.data.changed ? `Коммит отправлен: ${result.data.sha.slice(0, 7)}` : 'Изменений нет');
      return result.data;
    } finally {
      setLoading(false);
    }
  };

  const checkGitFolderChanges = async (folderPath: string, targetBranch: string): Promise<GitFolderChangesSummary | null> => {
    const result = await window.electronAPI?.github.checkGitFolderChanges(folderPath, targetBranch);
    if (result?.success && result.data) return result.data;
    return null;
  };

  const commitGitFolderChanges = async (
    folderPath: string,
    targetBranch: string,
    message: string,
    push: boolean,
  ): Promise<CommitResult | null> => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.github.commitGitFolderChanges(folderPath, targetBranch, message, push);
      if (!result?.success || !result.data) {
        showError(result?.error || 'Не удалось создать локальный commit');
        return null;
      }
      notify(result.data.changed
        ? (push ? `Commit создан и отправлен: ${result.data.sha.slice(0, 7)}` : `Локальный commit создан: ${result.data.sha.slice(0, 7)}`)
        : 'Изменений нет');
      return result.data;
    } finally {
      setLoading(false);
    }
  };

  const searchCommits = async (owner: string, repo: string, query: string, author?: string, since?: string, until?: string): Promise<GitHubCommit[]> => {
    const result = await window.electronAPI?.github.searchCommits(owner, repo, query, author, since, until);
    if (result?.success && result.data) {
      return result.data;
    }
    return [];
  };

  const getLatestCommit = async (owner: string, repo: string): Promise<GitHubCommit | null> => {
    const result = await window.electronAPI?.github.getLatestCommit(owner, repo);
    if (result?.success) return result.data ?? null;
    return null;
  };

  const selectReleaseAsset = async (): Promise<ReleaseAssetSelection | null> => {
    if (!window.electronAPI) return null;
    const result = await window.electronAPI.app.selectReleaseAsset();
    if (result?.success) return result.data ?? null;
    if (result?.error) showError(result.error);
    return null;
  };

  const selectUploadFolder = async (): Promise<UploadFolderSummary | null> => {
    if (!window.electronAPI) return null;
    const result = await window.electronAPI.app.selectUploadFolder();
    if (result?.success && result.data) return result.data;
    if (result?.error) showError(result.error);
    return null;
  };

  const clearUploadFolder = async () => {
    await window.electronAPI?.app.clearUploadFolder();
  };

  const openExternal = async (url: string) => {
    const result = await window.electronAPI?.openExternal(url);
    if (!result?.success) showError(result?.error || 'Не удалось открыть ссылку');
  };

  const loadReleases = async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.app.getReleases();
    if (result?.success && result.data) {
      setReleases(result.data);
    }
  };

  const downloadRelease = async (url: string, fileName: string): Promise<string | null> => {
    if (!window.electronAPI) {
      showError('Загрузка доступна в приложении Gitora');
      return null;
    }
    setLoading(true);
    try {
      const result = await window.electronAPI.app.downloadRelease(url, fileName, readDownloadOptions());
      if (result?.success && result.data) {
        notify(`Файл ${fileName} загружен`);
        return result.data;
      }
      showError(result?.error || 'Не удалось загрузить файл');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const downloadArchive = async (owner: string, repo: string, sha: string): Promise<string | null> => {
    if (!window.electronAPI) {
      showError('Загрузка доступна в приложении Gitora');
      return null;
    }
    setLoading(true);
    try {
      const result = await window.electronAPI.app.downloadArchive(owner, repo, sha, readDownloadOptions());
      if (result?.success && result.data) {
        notify('Архив скачан');
        return result.data;
      }
      showError(result?.error || 'Не удалось скачать архив');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loadRepositoryData = async (
    targetProject: Project,
    clearBeforeLoad: boolean,
    notifyOnSuccess: boolean,
  ): Promise<boolean> => {
    const currentRequest = ++requestId.current;
    const [owner, repo] = targetProject.repo.split('/');

    if (clearBeforeLoad) {
      commitStatsCache.current.clear();
      setBranchFilter('all');
      setSelectedCommit(null);
      setGraphLayout(null);
      setCommits([]);
      setBranches([]);
      setRepositoryEmpty(false);
      setRepositoryCommits([]);
      setLastUpdatedAt(null);
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI?.github.getRepository(owner, repo, readCommitLimit());
      if (currentRequest !== requestId.current) return false;
      if (!result?.success || !result.data) {
        showError(result?.error || 'Не удалось загрузить репозиторий');
        return false;
      }

      const repository = result.data;
      setRepositoryEmpty(Boolean(repository.empty));
      const nextBranches = mergeBranchPreferences(targetProject.repo, repository.branches.map(branch => ({
        name: branch.name,
        tipSha: branch.commit.sha,
      })));
      const layout = computeGraphLayout(repository.commits, nextBranches);
      setRepositoryCommits(repository.commits);
      setBranches(nextBranches);
      setGraphLayout(layout);
      setCommits(mapCommits(repository.commits, layout));
      setProjects(current => current.map(item => (
        item.id === targetProject.id
          ? { ...item, commits: repository.commits.length, branches: nextBranches.length }
          : item
      )));
      setLastUpdatedAt(new Date().toISOString());
      if (notifyOnSuccess) notify('Обновлено');
      return true;
    } catch {
      if (currentRequest === requestId.current) showError('Не удалось обновить данные');
      return false;
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  };

  const applyCommitStats = (sha: string, details: CommitDetails | undefined, status: Commit['statsStatus']) => {
    setCommits(current => current.map(commit => commit.id === sha
      ? {
        ...commit,
        files: details?.files ?? commit.files,
        plus: details?.plus ?? commit.plus,
        minus: details?.minus ?? commit.minus,
        changeStats: details ?? commit.changeStats,
        filesChanged: details?.filesChanged ?? commit.filesChanged,
        statsStatus: status,
      }
      : commit));
    setSelectedCommit(current => current?.id === sha
      ? {
        ...current,
        files: details?.files ?? current.files,
        plus: details?.plus ?? current.plus,
        minus: details?.minus ?? current.minus,
        changeStats: details ?? current.changeStats,
        filesChanged: details?.filesChanged ?? current.filesChanged,
        statsStatus: status,
      }
      : current);
  };

  const loadCommitDetail = async (sha: string): Promise<CommitDetails | null> => {
    const cached = commitStatsCache.current.get(sha);
    if (cached) {
      applyCommitStats(sha, cached, 'loaded');
      return cached;
    }

    const pending = commitStatsRequests.current.get(sha);
    if (pending) return pending;

    const targetProject = projectRef.current;
    if (!targetProject || !window.electronAPI) return null;
    const [owner, repo] = targetProject.repo.split('/');
    applyCommitStats(sha, undefined, 'loading');

    const request = (async () => {
      try {
        const result = await window.electronAPI!.github.getCommitDetail(owner, repo, sha);
        if (projectRef.current?.id !== targetProject.id) return null;
        if (!result.success || !result.data) {
          applyCommitStats(sha, undefined, 'error');
          return null;
        }
        const details = mapCommitDetails(result.data) || { files: 0, plus: 0, minus: 0, filesChanged: [] };
        commitStatsCache.current.set(sha, details);
        applyCommitStats(sha, details, 'loaded');
        return details;
      } catch {
        if (projectRef.current?.id === targetProject.id) applyCommitStats(sha, undefined, 'error');
        return null;
      } finally {
        commitStatsRequests.current.delete(sha);
        setCommitStatsLoading(commitStatsRequests.current.size > 0);
      }
    })();

    commitStatsRequests.current.set(sha, request);
    setCommitStatsLoading(true);
    return request;
  };

  const loadCommitDetails = async (shas: string[]): Promise<void> => {
    const uniqueShas = [...new Set(shas)].filter(sha => !commitStatsCache.current.has(sha));
    if (!uniqueShas.length) return;

    let cursor = 0;
    let failed = 0;
    const workerCount = Math.min(4, uniqueShas.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (cursor < uniqueShas.length) {
        const sha = uniqueShas[cursor];
        cursor += 1;
        const details = await loadCommitDetail(sha);
        if (!details) failed += 1;
      }
    }));
    if (failed) notify(`Не удалось загрузить статистику для ${failed} коммитов`);
  };

  const refreshRepositoryData = async (): Promise<boolean> => {
    if (!project || !connected || !window.electronAPI) return false;
    return loadRepositoryData(project, false, true);
  };

  const syncAllData = async (): Promise<boolean> => {
    if (!connected || !window.electronAPI) return false;

    const syncRequest = ++requestId.current;
    const currentProjectId = project?.id;
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.github.getRepos();
      if (syncRequest !== requestId.current) return false;
      if (!result?.success || !result.data) {
        showError(result?.error || 'Не удалось синхронизировать репозитории');
        return false;
      }

      const nextProjects = mapProjects(result.data);
      const nextProject = currentProjectId
        ? nextProjects.find(item => item.id === currentProjectId) ?? nextProjects[0] ?? null
        : nextProjects[0] ?? null;
      const currentProjectStillExists = nextProject?.id === currentProjectId;

      setProjects(nextProjects);
      setProject(nextProject);

      if (!nextProject) {
        setBranchFilter('all');
        setSelectedCommit(null);
        setGraphLayout(null);
        setCommits([]);
        setBranches([]);
        setRepositoryEmpty(false);
        setRepositoryCommits([]);
        setLastUpdatedAt(null);
        notify('Обновлено');
        return true;
      }

      const refreshed = await loadRepositoryData(nextProject, !currentProjectStillExists, false);
      if (refreshed) notify('Обновлено');
      return refreshed;
    } catch {
      if (syncRequest === requestId.current) showError('Не удалось синхронизировать данные');
      return false;
    } finally {
      if (syncRequest === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    applyThemePreference(readThemePreference(localStorage.getItem('gitora-settings')));
    const restore = async () => {
      if (!window.electronAPI) {
        setLoginOpen(true);
        return;
      }
      setLoading(true);
      const [sessionResult, versionResult] = await Promise.all([
        window.electronAPI.github.restoreSession(),
        window.electronAPI.app.getCurrentVersion(),
      ]);
      if (versionResult?.success && versionResult.data) {
        setCurrentVersion(versionResult.data);
      }
      if (sessionResult.success && sessionResult.data) {
        setUser(sessionResult.data);
        setConnected(true);
        await loadRepos();
      } else {
        if (sessionResult.error || sessionResult.errorCode) {
          showConnectionError(sessionResult.errorCode, sessionResult.error);
        }
        setLoginOpen(true);
      }
      setLoading(false);
      void refreshAiStatus();
      void loadReleases();
    };
    void restore();
    return () => window.clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    if (!window.electronAPI) return;
    void refreshAiStatus();
    const timer = window.setInterval(() => void refreshAiStatus(), 3000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => applyThemePreference(readThemePreference(localStorage.getItem('gitora-settings')));
    media.addEventListener('change', syncTheme);
    window.addEventListener('storage', syncTheme);
    return () => {
      media.removeEventListener('change', syncTheme);
      window.removeEventListener('storage', syncTheme);
    };
  }, []);

  useEffect(() => {
    if (!project || !connected || !window.electronAPI) return;
    void loadRepositoryData(project, true, false);
  }, [project?.id, connected]);

  return (
    <AppContext.Provider value={{
      project,
      selectedCommit,
      commitStatsLoading,
      branchFilter,
      mobileOpen,
      createOpen,
      editOpen,
      branchOpen,
      settingsOpen,
      loginOpen,
      updatesOpen,
      releaseOpen,
      readmeOpen,
      changesOpen,
      aiOpen,
      toast,
      projects,
      commits,
      branches,
      repositoryEmpty,
      user,
      connected,
      loading,
      error,
      graphLayout,
      lastUpdatedAt,
      releases,
      currentVersion,
      connectionError: connectionFailure,
      aiStatus,
      aiDiagnostics,
      aiDiagnosticsLoading,
      setProject,
      setSelectedCommit,
      setBranchFilter,
      setMobileOpen,
      setCreateOpen,
      setEditOpen,
      setBranchOpen,
      setSettingsOpen,
      setLoginOpen,
      setUpdatesOpen,
      setReleaseOpen,
      setReadmeOpen,
      setChangesOpen,
      setAiOpen,
      notify,
      login,
      clearConnectionError,
      logout,
      createRepo,
      deleteRepo,
      updateRepo,
      createBranch,
      deleteBranch,
      renameBranch,
      updateBranchVisualSettings,
      pullRequests,
      selectedPR,
      setSelectedPR,
      prOpen,
      setPrOpen,
      loadPullRequests,
      getPullRequest,
      createPullRequest,
      issues,
      selectedIssue,
      setSelectedIssue,
      issueOpen,
      setIssueOpen,
      loadIssues,
      getIssue,
      createIssue,
      createRelease,
      getReadme,
      saveReadme,
      checkFolderChanges,
      commitFolderChanges,
      checkGitFolderChanges,
      commitGitFolderChanges,
      searchCommits,
      getLatestCommit,
      loadCommitDetail,
      loadCommitDetails,
      selectReleaseAsset,
      selectUploadFolder,
      clearUploadFolder,
      openExternal,
      loadReleases,
      downloadRelease,
      downloadArchive,
      refreshRepositoryData,
      syncAllData,
      refreshAiStatus,
      runAiDiagnostics,
      configureAiClient,
      disconnectAiClient,
      restartMcp,
      allowMcpWrites,
      revokeMcpWrites,
    }}>
      {children}
    </AppContext.Provider>
  );
};
