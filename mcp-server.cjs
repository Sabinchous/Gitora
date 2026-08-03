#!/usr/bin/env node

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { McpConnectionManager } = require('./mcpConnectionManager.cjs');
const { createRepositoryFile, refPath } = require('./mcpRepository.cjs');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

function loadZod() {
  try {
    return require('zod');
  } catch {
    const sdkEntry = require.resolve('@modelcontextprotocol/sdk/server/mcp.js');
    return require(require.resolve('zod', { paths: [path.dirname(sdkEntry)] }));
  }
}

const { z } = loadZod();

const GITHUB_ORIGIN = 'https://github.com';
const HEALTH_ENDPOINT = '/__gitora__/health';
const REPO_PART = /^[A-Za-z0-9_.-]+$/;
const MCP_CLIENT_ID = process.argv.find(argument => argument.startsWith('--client='))?.slice('--client='.length) || 'manual';
const EXPLICIT_BRIDGE_METADATA_PATH = process.argv.find(argument => argument.startsWith('--bridge-metadata='))?.slice('--bridge-metadata='.length) || '';
const MCP_TOOL_NAMES = [
  'list_repos',
  'get_commits',
  'get_branches',
  'get_commit_detail',
  'search_commits',
  'create_repo_file',
  'create_issue',
  'add_issue_comment',
  'create_pull_request',
  'get_git_commit_object',
  'create_git_blob',
  'create_git_tree',
  'create_git_commit',
  'create_git_branch',
  'update_git_branch',
];
const configuredHeartbeatInterval = Number(process.env.GITORA_MCP_HEARTBEAT_MS);
const HEARTBEAT_INTERVAL_MS = Number.isFinite(configuredHeartbeatInterval) && configuredHeartbeatInterval > 0
  ? configuredHeartbeatInterval
  : 5000;
let heartbeatTimer = null;
let stopping = false;
let lifecycleLogQueue = Promise.resolve();
let bridgeConnection = null;

function bridgeCandidates(home = os.homedir()) {
  const roots = [
    process.env.APPDATA,
    process.env.LOCALAPPDATA,
    path.join(home, 'AppData', 'Roaming'),
    path.join(home, 'AppData', 'Local'),
    path.join(home, '.config'),
    path.join(home, 'Library', 'Application Support'),
    home,
  ].filter(Boolean);
  const appDirectories = roots.flatMap(root => [
    path.join(root, 'gitora'),
    path.join(root, 'Gitora'),
  ]);

  return [...new Set([
    ...(EXPLICIT_BRIDGE_METADATA_PATH ? [path.resolve(EXPLICIT_BRIDGE_METADATA_PATH)] : []),
    ...appDirectories.map(directory => path.join(directory, 'mcp-bridge.json')),
  ])];
}

function lifecycleLog(event, details = {}) {
  const entry = {
    at: new Date().toISOString(),
    process: 'gitora-mcp-server',
    event,
    ...details,
  };
  const humanLabels = {
    mcp_starting: 'Starting bridge',
    mcp_session_creating: 'Creating session',
    mcp_session_created: 'Session ID:',
    mcp_connected: 'Connected',
    mcp_heartbeat_ok: 'Heartbeat OK',
    mcp_request_received: 'Request received',
    mcp_request_completed: 'Request completed',
    mcp_connection_lost: 'Connection lost',
    mcp_reconnecting: 'Reconnecting',
    mcp_session_closed: 'Session closed',
  };
  const humanLabel = humanLabels[event];
  if (humanLabel) {
    const sessionSuffix = event === 'mcp_session_created' && details.sessionId ? ` ${details.sessionId}` : '';
    console.error(`[MCP] ${humanLabel}${sessionSuffix}`);
  }
  if (event === 'mcp_session_state') {
    console.error('[MCP Session] Session ID:', details.sessionId || '—');
    console.error('[MCP Session] Created:', details.created || '—');
    console.error('[MCP Session] Active:', Boolean(details.active));
    console.error('[MCP Session] Disconnected:', details.disconnected || '—');
  }
  if (event === 'mcp_startup') {
    console.error('[MCP Startup] Started:', Boolean(details.started));
    console.error('[MCP Startup] PID:', details.pid || '—');
    console.error('[MCP Startup] Tools loaded:', details.toolsLoaded || 0);
  }
  console.error(`[Gitora MCP] ${event}`, JSON.stringify(details));
  const metadataPath = details.metadataPath || bridgeConnection?.getMetadataPath?.();
  if (metadataPath) {
    lifecycleLogQueue = lifecycleLogQueue
      .then(() => fs.appendFile(
        path.join(path.dirname(metadataPath), 'mcp-lifecycle.log'),
        `${JSON.stringify(entry)}\n`,
        { encoding: 'utf8' },
      ))
      .catch(() => {});
  }
  return lifecycleLogQueue;
}

async function readBridgeMetadataInfos() {
  const results = [];
  for (const candidate of bridgeCandidates()) {
    try {
      const metadata = JSON.parse(await fs.readFile(candidate, 'utf8'));
      if (
        metadata?.version === 1
        && typeof metadata.socketPath === 'string'
        && typeof metadata.secret === 'string'
        && metadata.secret.length === 64
        && (metadata.sessionId === undefined || typeof metadata.sessionId === 'string')
      ) {
        results.push({ metadata, metadataPath: candidate });
      }
    } catch {}
  }
  return results;
}

bridgeConnection = new McpConnectionManager({
  clientId: MCP_CLIENT_ID,
  readBridgeMetadataInfos,
  onLog: lifecycleLog,
  onBridgeShutdown: async error => {
    stopping = true;
    await lifecycleLog('mcp_session_closed', {
      client: MCP_CLIENT_ID,
      reason: error instanceof Error ? error.message : 'Gitora bridge closed',
    });
    process.exit(0);
  },
});

function repoEndpoint(owner, repo, suffix) {
  if (!REPO_PART.test(owner) || !REPO_PART.test(repo)) {
    throw new Error('Invalid repository name');
  }
  return `/repos/${owner}/${repo}${suffix}`;
}

async function githubFetch(endpoint, options = {}) {
  return bridgeConnection.request(endpoint, options);
}

const server = new McpServer({
  name: 'gitora',
  version: '0.2.0',
});

server.prompt(
  'gitora-usage',
  'Инструкция по работе с Gitora: выбирайте инструмент по запросу пользователя.',
  async () => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: [
          'Используй Gitora для вопросов о GitHub-репозиториях пользователя.',
          'Для списка репозиториев используй list_repos.',
          'Для веток используй get_branches, для истории — get_commits.',
          'Для поиска по сообщению или автору используй search_commits.',
          'Для файлов, additions, deletions и полного сообщения используй get_commit_detail.',
          'Для создания Issue используй create_issue, для комментария — add_issue_comment, для Pull Request — create_pull_request.',
          'Сначала выполняй безопасные операции чтения. Опасные операции требуют отдельного подтверждения пользователя внутри Gitora.',
        ].join(' '),
      },
    }],
  }),
);

server.tool(
  'list_repos',
  'List user GitHub repositories',
  {
    sort: z.enum(['updated', 'created', 'pushed', 'full_name']).optional()
      .describe('Sort order (default: updated)'),
  },
  async ({ sort }) => {
    const repos = await githubFetch(`/user/repos?per_page=100&sort=${sort || 'updated'}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(repos.map(repo => ({
          name: repo.name,
          full_name: repo.full_name,
          private: repo.private,
          description: repo.description,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          language: repo.language,
          updated_at: repo.updated_at,
          url: repo.html_url,
        })), null, 2),
      }],
    };
  }
);

server.tool(
  'get_commits',
  'Get commit history for a repository',
  {
    owner: z.string().describe('Repository owner (user or organization)'),
    repo: z.string().describe('Repository name'),
    branch: z.string().optional().describe('Branch name (default: default branch)'),
    limit: z.number().min(1).max(100).optional()
      .describe('Number of commits to return (default: 30, max: 100)'),
  },
  async ({ owner, repo, branch, limit }) => {
    const params = new URLSearchParams({ per_page: String(limit || 30) });
    if (branch) params.set('sha', branch);
    const commits = await githubFetch(`/repos/${owner}/${repo}/commits?${params}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(commits.map(c => ({
          sha: c.sha,
          short_sha: c.sha.slice(0, 7),
          message: c.commit.message.split('\n')[0],
          full_message: c.commit.message,
          author: c.author?.login || c.commit.author.name,
          date: c.commit.author.date,
          url: c.html_url,
          parents: c.parents.map(p => p.sha),
        })), null, 2),
      }],
    };
  }
);

server.tool(
  'get_branches',
  'List branches in a repository',
  {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
  },
  async ({ owner, repo }) => {
    const branches = await githubFetch(`/repos/${owner}/${repo}/branches?per_page=100`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(branches.map(b => ({
          name: b.name,
          tip_sha: b.commit.sha,
          is_default: b.name === 'main' || b.name === 'master',
          url: `${GITHUB_ORIGIN}/${owner}/${repo}/tree/${b.name}`,
        })), null, 2),
      }],
    };
  }
);

server.tool(
  'get_commit_detail',
  'Get detailed commit information including file changes',
  {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    sha: z.string().describe('Commit SHA'),
  },
  async ({ owner, repo, sha }) => {
    const commit = await githubFetch(`/repos/${owner}/${repo}/commits/${sha}`);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          sha: commit.sha,
          short_sha: commit.sha.slice(0, 7),
          message: commit.commit.message,
          author: commit.author?.login || commit.commit.author.name,
          date: commit.commit.author.date,
          url: commit.html_url,
          stats: commit.stats,
          files: (commit.files || []).map(f => ({
            name: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            changes: f.changes,
          })),
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'search_commits',
  'Search commits by message or author',
  {
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    query: z.string().describe('Search query (matches commit message)'),
    limit: z.number().min(1).max(50).optional()
      .describe('Max results (default: 10)'),
  },
  async ({ owner, repo, query, limit }) => {
    const result = await githubFetch(`/repos/${owner}/${repo}/commits?per_page=100`);
    const q = query.toLowerCase();
    const matched = result.filter(c =>
      c.commit.message.toLowerCase().includes(q)
      || (c.author?.login || '').toLowerCase().includes(q)
      || c.commit.author.name.toLowerCase().includes(q)
    ).slice(0, limit || 10);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(matched.map(c => ({
          sha: c.sha,
          short_sha: c.sha.slice(0, 7),
          message: c.commit.message.split('\n')[0],
          author: c.author?.login || c.commit.author.name,
          date: c.commit.author.date,
          url: c.html_url,
        })), null, 2),
      }],
    };
  }
);

server.tool(
  'create_repo_file',
  'Create the first file and commit in an empty repository',
  {
    owner: z.string(),
    repo: z.string(),
    path: z.string(),
    message: z.string(),
    content: z.string().describe('UTF-8 text; Gitora encodes it for the GitHub API'),
    branch: z.string().optional(),
  },
  async ({ owner, repo, path: filePath, message, content, branch }) => ({
    content: [{
      type: 'text',
      text: JSON.stringify(await createRepositoryFile(githubFetch, { owner, repo, path: filePath, message, content, branch }), null, 2),
    }],
  }),
);

server.tool(
  'create_issue',
  'Create an issue in a repository',
  {
    owner: z.string(),
    repo: z.string(),
    title: z.string().min(1),
    body: z.string().optional(),
    labels: z.array(z.string()).optional(),
  },
  async ({ owner, repo, title, body, labels }) => ({
    content: [{
      type: 'text',
      text: JSON.stringify(await githubFetch(repoEndpoint(owner, repo, '/issues'), {
        method: 'POST',
        body: { title, body, ...(labels?.length ? { labels } : {}) },
      }), null, 2),
    }],
  }),
);

server.tool(
  'add_issue_comment',
  'Add a comment to an issue or pull request',
  {
    owner: z.string(),
    repo: z.string(),
    number: z.number().int().positive(),
    body: z.string().min(1),
  },
  async ({ owner, repo, number, body }) => ({
    content: [{
      type: 'text',
      text: JSON.stringify(await githubFetch(repoEndpoint(owner, repo, `/issues/${number}/comments`), {
        method: 'POST',
        body: { body },
      }), null, 2),
    }],
  }),
);

server.tool(
  'create_pull_request',
  'Create a pull request in a repository',
  {
    owner: z.string(),
    repo: z.string(),
    title: z.string().min(1),
    head: z.string().min(1),
    base: z.string().min(1),
    body: z.string().optional(),
  },
  async ({ owner, repo, title, head, base, body }) => ({
    content: [{
      type: 'text',
      text: JSON.stringify(await githubFetch(repoEndpoint(owner, repo, '/pulls'), {
        method: 'POST',
        body: { title, head, base, body },
      }), null, 2),
    }],
  }),
);

server.tool(
  'get_git_commit_object',
  'Get a raw Git commit object including its tree SHA',
  {
    owner: z.string(),
    repo: z.string(),
    sha: z.string(),
  },
  async ({ owner, repo, sha }) => ({
    content: [{
      type: 'text',
      text: JSON.stringify(await githubFetch(repoEndpoint(owner, repo, `/git/commits/${encodeURIComponent(sha)}`)), null, 2),
    }],
  }),
);

server.tool(
  'create_git_blob',
  'Create a Git blob in a repository',
  {
    owner: z.string(),
    repo: z.string(),
    content: z.string(),
    encoding: z.enum(['utf-8', 'base64']).optional(),
  },
  async ({ owner, repo, content, encoding }) => ({
    content: [{
      type: 'text',
      text: JSON.stringify(await githubFetch(repoEndpoint(owner, repo, '/git/blobs'), {
        method: 'POST',
        body: { content, encoding: encoding || 'utf-8' },
      }), null, 2),
    }],
  }),
);

server.tool(
  'create_git_tree',
  'Create a Git tree in a repository',
  {
    owner: z.string(),
    repo: z.string(),
    base_tree: z.string().optional(),
    tree: z.array(z.object({
      path: z.string(),
      mode: z.string().optional(),
      type: z.enum(['blob', 'tree', 'commit']).optional(),
      sha: z.string().nullable().optional(),
    })),
  },
  async ({ owner, repo, base_tree, tree }) => ({
    content: [{
      type: 'text',
      text: JSON.stringify(await githubFetch(repoEndpoint(owner, repo, '/git/trees'), {
        method: 'POST',
        body: { base_tree, tree },
      }), null, 2),
    }],
  }),
);

server.tool(
  'create_git_commit',
  'Create a Git commit in a repository',
  {
    owner: z.string(),
    repo: z.string(),
    message: z.string(),
    tree: z.string(),
    parents: z.array(z.string()).optional(),
  },
  async ({ owner, repo, message, tree, parents }) => ({
    content: [{
      type: 'text',
      text: JSON.stringify(await githubFetch(repoEndpoint(owner, repo, '/git/commits'), {
        method: 'POST',
        body: { message, tree, ...(parents?.length ? { parents } : {}) },
      }), null, 2),
    }],
  }),
);

server.tool(
  'create_git_branch',
  'Create a branch from a commit SHA',
  {
    owner: z.string(),
    repo: z.string(),
    branch: z.string(),
    sha: z.string(),
  },
  async ({ owner, repo, branch, sha }) => ({
    content: [{
      type: 'text',
      text: JSON.stringify(await githubFetch(repoEndpoint(owner, repo, '/git/refs'), {
        method: 'POST',
        body: { ref: `refs/heads/${refPath(branch)}`, sha },
      }), null, 2),
    }],
  }),
);

server.tool(
  'update_git_branch',
  'Move a branch to a commit SHA',
  {
    owner: z.string(),
    repo: z.string(),
    branch: z.string(),
    sha: z.string(),
  },
  async ({ owner, repo, branch, sha }) => ({
    content: [{
      type: 'text',
      text: JSON.stringify(await githubFetch(repoEndpoint(owner, repo, `/git/refs/heads/${refPath(branch)}`), {
        method: 'PATCH',
        body: { sha, force: false },
      }), null, 2),
    }],
  }),
);

async function main() {
  lifecycleLog('mcp_starting', { client: MCP_CLIENT_ID });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const heartbeat = async () => {
    if (stopping) return;
    try {
      await bridgeConnection.request(HEALTH_ENDPOINT);
      await lifecycleLog('mcp_heartbeat_ok', {
        client: MCP_CLIENT_ID,
        sessionId: bridgeConnection.getSessionId(),
        metadataPath: bridgeConnection.getMetadataPath(),
      });
    } catch (error) {
      if (stopping) return;
      await lifecycleLog('mcp_connection_lost', {
        client: MCP_CLIENT_ID,
        error: error instanceof Error ? error.message : 'Gitora bridge unavailable',
      });
      await bridgeConnection.reconnect(error);
    }
  };
  try {
    await bridgeConnection.connect();
  } catch (error) {
    await lifecycleLog('mcp_connection_lost', {
      client: MCP_CLIENT_ID,
      error: error instanceof Error ? error.message : 'Gitora bridge unavailable',
    });
  }
  await heartbeat();
  heartbeatTimer = setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();
  const shutdown = async reason => {
    if (stopping) return;
    stopping = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    bridgeConnection.close(reason);
    await lifecycleLog('mcp_session_closed', { client: MCP_CLIENT_ID, reason });
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('exit', () => {
    stopping = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  });
  await lifecycleLog('mcp_startup', {
    client: MCP_CLIENT_ID,
    started: true,
    pid: process.pid,
    toolsLoaded: MCP_TOOL_NAMES.length,
  });
  lifecycleLog('mcp_server_started', { client: MCP_CLIENT_ID });
  console.error('Gitora MCP server running on stdio');
}

main().catch(async err => {
  await lifecycleLog('mcp_server_start_failed', { error: err instanceof Error ? err.message : 'Unknown MCP server error' });
  process.exit(1);
});
