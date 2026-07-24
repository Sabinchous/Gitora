#!/usr/bin/env node

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const fs = require('fs/promises');
const net = require('net');
const path = require('path');
const os = require('os');

const GITHUB_ORIGIN = 'https://github.com';

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

  return [...new Set(appDirectories.map(directory => path.join(directory, 'mcp-bridge.json')))];
}

async function readBridgeMetadata() {
  for (const candidate of bridgeCandidates()) {
    try {
      const metadata = JSON.parse(await fs.readFile(candidate, 'utf8'));
      if (
        metadata?.version === 1
        && typeof metadata.socketPath === 'string'
        && typeof metadata.secret === 'string'
        && metadata.secret.length === 64
      ) {
        return metadata;
      }
    } catch {}
  }
  throw new Error('Gitora session bridge not found. Open Gitora and login first.');
}

async function githubFetch(endpoint) {
  const bridge = await readBridgeMetadata();

  return new Promise((resolve, reject) => {
    const socket = net.createConnection(bridge.socketPath);
    let response = '';

    const fail = error => {
      socket.destroy();
      reject(error instanceof Error ? error : new Error('Gitora session bridge unavailable.'));
    };

    socket.setEncoding('utf8');
    socket.setTimeout(5000, () => fail(new Error('Gitora session bridge timed out.')));
    socket.once('error', fail);
    socket.on('data', chunk => {
      response += chunk;
      const lineEnd = response.indexOf('\n');
      if (lineEnd === -1) return;

      socket.destroy();
      try {
        const result = JSON.parse(response.slice(0, lineEnd));
        if (result.success) resolve(result.data);
        else reject(new Error(result.error || 'Gitora session bridge request failed.'));
      } catch {
        reject(new Error('Invalid response from Gitora session bridge.'));
      }
    });
    socket.once('connect', () => {
      socket.write(`${JSON.stringify({ secret: bridge.secret, endpoint })}\n`);
    });
  });
}

const server = new McpServer({
  name: 'gitora',
  version: '0.1.12',
});

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Gitora MCP server running on stdio');
}

main().catch(err => {
  console.error('MCP server error:', err);
  process.exit(1);
});
