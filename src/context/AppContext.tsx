import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Branch,
  Commit,
  CommitResult,
  CreateReleaseInput,
  CreateRepositoryResult,
  DownloadOptions,
  FolderChangesSummary,
  GitHubCommit,
  GitHubIssue,
  GitHubPR,
  GitHubRepo,
  GitHubUser,
  Project,
  Release,
  ReleaseAssetSelection,
  UploadFolderSummary,
} from '../types';
import { computeGraphLayout, GraphLayoutResult } from '../lib/graphLayout';
import { applyThemePreference, readThemePreference } from '../lib/theme';

interface AppState {
  project: Project | null;
  selectedCommit: Commit | null;
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
  user: GitHubUser | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
  graphLayout: GraphLayoutResult | null;
  lastUpdatedAt: string | null;
  releases: Release[];
  currentVersion: string;
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
  notify: (text: string) => void;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  createRepo: (name: string, description: string, isPrivate: boolean, folderPath?: string) => Promise<CreateRepositoryResult | null>;
  deleteRepo: (owner: string, repo: string) => Promise<boolean>;
  updateRepo: (owner: string, repo: string, data: { name?: string; description?: string; private?: boolean }) => Promise<boolean>;
  createBranch: (owner: string, repo: string, name: string, fromSha: string) => Promise<boolean>;
  deleteBranch: (owner: string, repo: string, branch: string) => Promise<boolean>;
  renameBranch: (owner: string, repo: string, branch: string, newName: string) => Promise<boolean>;
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
  selectUploadFolder: () => Promise<UploadFolderSummary | null>;
  selectReleaseAsset: () => Promise<ReleaseAssetSelection | null>;
  clearUploadFolder: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  loadReleases: () => Promise<void>;
  downloadRelease: (url: string, fileName: string) => Promise<string | null>;
  downloadArchive: (owner: string, repo: string, sha: string) => Promise<string | null>;
  refreshRepositoryData: () => Promise<boolean>;
  syncAllData: () => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);
const PROJECT_COLORS = ['#AEA989', '#8E7CA3', '#C58C75', '#5D7659'];
const BRANCH_COLORS = ['var(--branch-main)', 'var(--branch-1)', 'var(--branch-2)', 'var(--branch-3)', 'var(--branch-4)', 'var(--branch-5)'];

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
    description: repo.description || '',
    isPrivate: repo.private,
    defaultBranch: repo.default_branch || 'main',
  }));
}

function mapCommits(data: GitHubCommit[], layout: GraphLayoutResult): Commit[] {
  const commitBySha = new Map(data.map(commit => [commit.sha, commit]));
  return layout.nodes.map((node, index) => ({
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
    files: 0,
    plus: 0,
    minus: 0,
    merge: node.isMerge,
    current: index === 0,
    parents: node.parents,
  }));
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [project, setProject] = useState<Project | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
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
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graphLayout, setGraphLayout] = useState<GraphLayoutResult | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [currentVersion, setCurrentVersion] = useState('0.1.12');
  const toastTimer = useRef<number | undefined>(undefined);
  const requestId = useRef(0);
  const initialized = useRef(false);

  const notify = (text: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  };

  const showError = (message?: string) => {
    setError(message || 'Неизвестная ошибка');
    window.setTimeout(() => setError(null), 5000);
  };

  const loadRepos = async () => {
    const result = await window.electronAPI?.github.getRepos();
    if (!result?.success || !result.data) {
      showError(result?.error || 'Не удалось загрузить репозитории');
      return;
    }
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
      setLoginOpen(false);
      await loadRepos();
    } else {
      showError(result.error || 'Не удалось подключить GitHub');
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
    setSelectedCommit(null);
    setGraphLayout(null);
    setLastUpdatedAt(null);
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
      notify(`Ветка переименована в «${newName}»`);
      await refreshRepositoryData();
      return true;
    } finally {
      setLoading(false);
    }
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

  const searchCommits = async (owner: string, repo: string, query: string, author?: string, since?: string, until?: string): Promise<GitHubCommit[]> => {
    const result = await window.electronAPI?.github.searchCommits(owner, repo, query, author, since, until);
    if (result?.success && result.data) {
      return result.data;
    }
    return [];
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
      setBranchFilter('all');
      setSelectedCommit(null);
      setGraphLayout(null);
      setCommits([]);
      setBranches([]);
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
      const nextBranches = repository.branches.map((branch, index): Branch => ({
        name: branch.name,
        tipSha: branch.commit.sha,
        color: branch.name === 'main' || branch.name === 'master'
          ? 'var(--branch-main)'
          : BRANCH_COLORS[(index + 1) % BRANCH_COLORS.length],
      }));
      const layout = computeGraphLayout(repository.commits, nextBranches);
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
        setLoginOpen(true);
      }
      setLoading(false);
      void loadReleases();
    };
    void restore();
    return () => window.clearTimeout(toastTimer.current);
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
      toast,
      projects,
      commits,
      branches,
      user,
      connected,
      loading,
      error,
      graphLayout,
      lastUpdatedAt,
      releases,
      currentVersion,
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
      notify,
      login,
      logout,
      createRepo,
      deleteRepo,
      updateRepo,
      createBranch,
      deleteBranch,
      renameBranch,
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
      searchCommits,
      selectReleaseAsset,
      selectUploadFolder,
      clearUploadFolder,
      openExternal,
      loadReleases,
      downloadRelease,
      downloadArchive,
      refreshRepositoryData,
      syncAllData,
    }}>
      {children}
    </AppContext.Provider>
  );
};
