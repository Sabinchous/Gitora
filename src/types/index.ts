export interface Project {
  id: string;
  name: string;
  repo: string;
  color: string;
  commits: number;
  branches: number;
  updated: string;
  updatedAt: string;
  description: string;
  isPrivate: boolean;
  defaultBranch: string;
}

export interface Commit {
  id: string;
  x: number;
  y: number;
  lane: number;
  row: number;
  branch: string;
  label: string;
  author: string;
  time: string;
  hash: string;
  text: string;
  files: number;
  plus: number;
  minus: number;
  changeStats?: CommitChangeStats;
  filesChanged?: CommitFileChange[];
  statsStatus?: 'idle' | 'loading' | 'loaded' | 'error';
  merge?: boolean;
  current?: boolean;
  parents: string[];
}

export interface CommitChangeStats {
  files: number;
  plus: number;
  minus: number;
}

export interface CommitFileChange {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  status: string;
  patch?: string;
  previousFilename?: string;
}

export interface CommitDetails extends CommitChangeStats {
  filesChanged: CommitFileChange[];
}

export type BranchDirection = 'left' | 'auto' | 'right';

export interface Branch {
  name: string;
  color: string;
  tipSha: string;
  direction: BranchDirection;
}

export interface GitHubUser {
  login: string;
  name: string;
  avatar_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  default_branch: string;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  author: {
    login: string;
    avatar_url: string;
  } | null;
  parents: { sha: string }[];
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  files?: {
    filename: string;
    additions: number;
    deletions: number;
    changes: number;
    status: string;
    patch?: string;
    previous_filename?: string;
  }[];
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
  };
}

export interface GitHubPR {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged: boolean;
  user: {
    login: string;
    avatar_url: string;
  } | null;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  user: {
    login: string;
    avatar_url: string;
  } | null;
  labels: {
    name: string;
    color: string;
  }[];
  assignees: {
    login: string;
    avatar_url: string;
  }[];
  created_at: string;
  updated_at: string;
  html_url: string;
  pull_request?: unknown;
}

export interface GitHubApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  requiredPermission?: string;
  status?: number;
}

export interface RepositoryData {
  commits: GitHubCommit[];
  branches: GitHubBranch[];
  empty?: boolean;
  defaultBranch?: string;
}

export interface ReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
  downloadCount: number;
}

export interface Release {
  tag: string;
  name: string;
  body: string;
  publishedAt: string;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

export interface ReleaseAssetSelection {
  path: string;
  name: string;
  size: number;
}

export interface CreateReleaseInput {
  tagName: string;
  targetCommitish?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  makeLatest?: 'true' | 'false' | 'legacy';
  assetPath?: string;
}

export interface CommitResult {
  sha: string;
  changed: boolean;
  count?: number;
}

export interface FolderChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

export interface FolderChangesSummary {
  folderPath: string;
  branch: string;
  warnings: string[];
  added: number;
  modified: number;
  deleted: number;
  changes: FolderChange[];
}

export interface GitFolderChangesSummary extends FolderChangesSummary {
  isGitRepository: boolean;
  currentBranch: string;
  targetBranch: string;
  additions: number;
  deletions: number;
}

export type AiClientId = 'codex' | 'chatgpt' | 'claude' | 'cursor' | 'other' | 'manual';
export type AiConnectionLevel = 'ready' | 'attention' | 'error' | 'not_configured';

export interface AiToolStatus {
  name: string;
  label: string;
  description: string;
  available: boolean;
  readOnly?: boolean;
  lastCheckedAt?: string;
  error?: string;
}

export interface AiDiagnosticStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'warning' | 'error' | 'skipped';
  detail: string;
  durationMs?: number;
}

export interface AiActivityEntry {
  id: string;
  at: string;
  tool: string;
  repository: string;
  success: boolean;
  durationMs: number;
  client?: AiClientId;
  error?: string;
}

export interface AiClientStatus {
  id: AiClientId;
  label: string;
  configured: boolean;
  requiresRestart: boolean;
  configPath: string;
  supported: boolean;
  installed: boolean;
  connected: boolean;
}

export interface McpConfigDiagnostics {
  configPath: string;
  loaded: boolean;
  server: string;
}

export interface McpStartupDiagnostics {
  started: boolean;
  active?: boolean;
  pid: number;
  toolsLoaded: number;
  client?: string;
  lastHeartbeatAt?: string;
}

export interface McpClientDiagnostics {
  connected: boolean;
  session: string;
}

export interface GitHubAuthDiagnostics {
  user: string;
  authType: string;
  tokenSource: string;
  permissions: Record<string, boolean>;
  scopes: string[];
  acceptedScopes?: string[];
  acceptedPermissions?: Record<string, string | boolean>;
  repository?: string;
  permissionChecks: GitHubPermissionCheck[];
}

export interface GitHubPermissionCheck {
  action: string;
  permission: string;
  status: 'available' | 'missing' | 'unknown';
  detail: string;
}

export interface AiConnectionStatus {
  level: AiConnectionLevel;
  label: string;
  githubConnected: boolean;
  githubUser?: string;
  githubAuth: GitHubAuthDiagnostics;
  mcpConfig: McpConfigDiagnostics;
  mcpStartup: McpStartupDiagnostics;
  mcpClient: McpClientDiagnostics;
  mcpWritesAllowed: boolean;
  mcpWritesExpiresAt?: string;
  mcpRunning: boolean;
  mcpServerPath: string;
  mcpMetadataPath: string;
  mcpSessionId: string;
  currentRepository: string;
  repositoryAvailable: boolean;
  toolCount: number;
  tools: AiToolStatus[];
  client: AiClientStatus;
  clients: AiClientStatus[];
  lastSuccessfulRequest?: string;
  lastError?: string;
  configTemplate: string;
  activity: AiActivityEntry[];
}

export interface AiDiagnosticsResult {
  level: AiConnectionLevel;
  steps: AiDiagnosticStep[];
  status: AiConnectionStatus;
  checkedAt: string;
}

export interface AiClientSetupResult {
  client: AiClientStatus;
  configPath: string;
  backupPath?: string;
  configTemplate: string;
}

export interface McpWriteStatus {
  mcpWritesAllowed: boolean;
  mcpWritesExpiresAt?: string;
}

export interface UploadFolderSummary {
  path: string;
  fileCount: number;
  totalBytes: number;
  warnings: string[];
}

export interface CreateRepositoryResult {
  repo: GitHubRepo;
  uploadStatus: 'none' | 'success' | 'partial' | 'error';
  uploadedCount: number;
  skippedCount: number;
}

export interface DownloadOptions {
  mode?: 'downloads' | 'defaultFolder' | 'ask';
  directory?: string;
}

export interface ElectronAPI {
  github: {
    login: (token: string) => Promise<GitHubApiResult<GitHubUser>>;
    restoreSession: () => Promise<GitHubApiResult<GitHubUser | null>>;
    logout: () => Promise<GitHubApiResult<null>>;
    getRepos: () => Promise<GitHubApiResult<GitHubRepo[]>>;
    getLatestCommit: (owner: string, repo: string) => Promise<GitHubApiResult<GitHubCommit | null>>;
    getCommitDetail: (owner: string, repo: string, sha: string) => Promise<GitHubApiResult<GitHubCommit>>;
    getRepository: (owner: string, repo: string, commitLimit?: number) => Promise<GitHubApiResult<RepositoryData>>;
    createRepo: (
      name: string,
      description: string,
      isPrivate: boolean,
      folderPath?: string,
    ) => Promise<GitHubApiResult<CreateRepositoryResult>>;
    deleteRepo: (owner: string, repo: string) => Promise<GitHubApiResult<null>>;
    updateRepo: (owner: string, repo: string, data: { name?: string; description?: string; private?: boolean }) => Promise<GitHubApiResult<GitHubRepo>>;
    createBranch: (owner: string, repo: string, name: string, fromSha: string) => Promise<GitHubApiResult<GitHubBranch>>;
    deleteBranch: (owner: string, repo: string, branch: string) => Promise<GitHubApiResult<null>>;
    renameBranch: (owner: string, repo: string, branch: string, newName: string) => Promise<GitHubApiResult<GitHubBranch>>;
    getPullRequests: (owner: string, repo: string, state?: 'open' | 'closed' | 'all') => Promise<GitHubApiResult<GitHubPR[]>>;
    getPullRequest: (owner: string, repo: string, number: number) => Promise<GitHubApiResult<GitHubPR>>;
    createPullRequest: (owner: string, repo: string, title: string, body: string, head: string, base: string) => Promise<GitHubApiResult<GitHubPR>>;
    getIssues: (owner: string, repo: string, state?: 'open' | 'closed' | 'all') => Promise<GitHubApiResult<GitHubIssue[]>>;
    getIssue: (owner: string, repo: string, number: number) => Promise<GitHubApiResult<GitHubIssue>>;
    createIssue: (owner: string, repo: string, title: string, body: string, labels?: string[]) => Promise<GitHubApiResult<GitHubIssue>>;
    searchCommits: (owner: string, repo: string, query: string, author?: string, since?: string, until?: string) => Promise<GitHubApiResult<GitHubCommit[]>>;
    createRelease: (owner: string, repo: string, input: CreateReleaseInput) => Promise<GitHubApiResult<Release>>;
    getReadme: (owner: string, repo: string, branch: string) => Promise<GitHubApiResult<string>>;
    saveReadme: (owner: string, repo: string, branch: string, content: string, message: string) => Promise<GitHubApiResult<CommitResult>>;
    checkFolderChanges: (owner: string, repo: string, branch: string, folderPath: string) => Promise<GitHubApiResult<FolderChangesSummary>>;
    commitFolderChanges: (owner: string, repo: string, branch: string, folderPath: string, message: string) => Promise<GitHubApiResult<CommitResult>>;
    checkGitFolderChanges: (folderPath: string, targetBranch: string) => Promise<GitHubApiResult<GitFolderChangesSummary>>;
    commitGitFolderChanges: (folderPath: string, targetBranch: string, message: string, push: boolean) => Promise<GitHubApiResult<CommitResult>>;
  };
  app: {
    copyText: (text: string) => Promise<GitHubApiResult<null>>;
    getCurrentVersion: () => Promise<GitHubApiResult<string>>;
    getReleases: () => Promise<GitHubApiResult<Release[]>>;
    downloadRelease: (url: string, fileName: string, options?: DownloadOptions) => Promise<GitHubApiResult<string | null>>;
    downloadArchive: (owner: string, repo: string, sha: string, options?: DownloadOptions) => Promise<GitHubApiResult<string | null>>;
    selectReleaseAsset: () => Promise<GitHubApiResult<ReleaseAssetSelection | null>>;
    selectUploadFolder: () => Promise<GitHubApiResult<UploadFolderSummary | null>>;
    selectDownloadFolder: () => Promise<GitHubApiResult<string | null>>;
    clearUploadFolder: () => Promise<GitHubApiResult<null>>;
    getAiStatus: () => Promise<GitHubApiResult<AiConnectionStatus>>;
    runAiDiagnostics: (owner?: string, repo?: string, sha?: string) => Promise<GitHubApiResult<AiDiagnosticsResult>>;
    configureAiClient: (client: AiClientId) => Promise<GitHubApiResult<AiClientSetupResult>>;
    disconnectAiClient: (client: AiClientId) => Promise<GitHubApiResult<AiClientStatus>>;
    restartMcp: () => Promise<GitHubApiResult<AiConnectionStatus>>;
    allowMcpWrites: () => Promise<GitHubApiResult<McpWriteStatus>>;
    revokeMcpWrites: () => Promise<GitHubApiResult<McpWriteStatus>>;
    openAiConfigFolder: (client: AiClientId) => Promise<GitHubApiResult<null>>;
  };
  openExternal: (url: string) => Promise<GitHubApiResult<null>>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
