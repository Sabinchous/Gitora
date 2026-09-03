// Gitea provider for Gitora.
//
// Gitea implements a GitHub-like REST API under `{baseUrl}/api/v1` with
// `Authorization: token <token>` auth. Shapes are close to GitHub but not
// identical (pagination uses `limit`/`page`, branches expose `commit.id`,
// permissions use read/write/admin, merges use POST {Do: ...}).
//
// Strategy: the Electron main process keeps speaking "GitHub-style"
// endpoints internally; this module translates them to Gitea requests and
// normalizes Gitea responses back to the GitHub-shaped models the renderer
// already understands. UI code therefore works unchanged for both providers.

const GITEA_API_SUFFIX = '/api/v1';
const GITEA_MAX_LIMIT = 100;

function giteaUnsupported(message) {
  const error = new Error(message);
  error.code = 'gitea-unsupported';
  return error;
}

function giteaApiOrigin(baseUrl) {
  return `${baseUrl}${GITEA_API_SUFFIX}`;
}

function giteaOrigin(baseUrl) {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return '';
  }
}

// Accepts `https://gitea.example.com`, with optional path prefix and optional
// trailing `/api/v1`. Returns { baseUrl, apiOrigin }.
// Throws on anything that is not an http(s) URL.
function normalizeGiteaBaseUrl(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) throw new Error('Укажите адрес Gitea-сервера');
  let value = raw.replace(/\/+$/, '');
  value = value.replace(/\/api\/v1\/?$/, '');
  value = value.replace(/\/+$/, '');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Некорректный адрес Gitea: ожидается https://host[/path]');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Адрес Gitea должен начинаться с http:// или https://');
  }
  if (url.username || url.password || value.includes('@')) {
    throw new Error('Адрес Gitea не должен содержать учётные данные');
  }
  if (!url.hostname) throw new Error('Некорректный адрес Gitea: нет имени хоста');
  const baseUrl = url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, ''));
  return { baseUrl, apiOrigin: giteaApiOrigin(baseUrl) };
}

function giteaHeaders(token) {
  const cleanToken = typeof token === 'string' ? token.trim() : '';
  if (!cleanToken) {
    const error = new Error('Отсутствует токен доступа Gitea');
    error.code = 'auth';
    throw error;
  }
  return {
    Accept: 'application/json',
    Authorization: `token ${cleanToken}`,
    'User-Agent': 'Gitora-App',
  };
}

function cleanString(value) {
  return typeof value === 'string' ? value : '';
}

function cleanNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

// --- Response mappers: Gitea -> GitHub-shaped models ------------------------

function mapGiteaUserToGitHubUser(user) {
  if (!user || typeof user !== 'object') return null;
  return {
    login: cleanString(user.login),
    name: typeof user.full_name === 'string' && user.full_name.trim()
      ? user.full_name
      : (typeof user.name === 'string' && user.name ? user.name : null),
    avatar_url: cleanString(user.avatar_url),
    html_url: cleanString(user.html_url),
    type: cleanString(user.type) || 'User',
  };
}

function mapGiteaRepoToGitHubRepo(repo) {
  if (!repo || typeof repo !== 'object') return repo;
  const owner = repo.owner && typeof repo.owner === 'object' ? repo.owner : {};
  const permissions = repo.permissions && typeof repo.permissions === 'object' ? repo.permissions : {};
  return {
    id: repo.id,
    name: cleanString(repo.name),
    full_name: cleanString(repo.full_name) || cleanString(repo.name),
    private: Boolean(repo.private),
    description: repo.description == null ? '' : String(repo.description),
    stargazers_count: cleanNumber(repo.stars_count),
    forks_count: cleanNumber(repo.forks_count),
    updated_at: cleanString(repo.updated_at),
    default_branch: cleanString(repo.default_branch) || 'main',
    html_url: cleanString(repo.html_url),
    archived: Boolean(repo.archived),
    disabled: false,
    empty: repo.empty,
    owner: {
      login: cleanString(owner.login),
      type: cleanString(owner.type) || 'User',
      avatar_url: cleanString(owner.avatar_url),
      html_url: cleanString(owner.html_url),
    },
    permissions: {
      pull: permissions.pull !== false,
      push: Boolean(permissions.push),
      admin: Boolean(permissions.admin),
    },
  };
}

function mapGiteaCommitAuthor(author) {
  if (!author || typeof author !== 'object') return null;
  if (!author.login) return null;
  return {
    login: cleanString(author.login),
    avatar_url: cleanString(author.avatar_url),
  };
}

function mapGiteaCommitToGitHubCommit(commit) {
  if (!commit || typeof commit !== 'object') return commit;
  const inner = commit.commit && typeof commit.commit === 'object' ? commit.commit : {};
  const innerAuthor = inner.author && typeof inner.author === 'object' ? inner.author : {};
  const parents = Array.isArray(commit.parents)
    ? commit.parents.map(parent => ({ sha: cleanString(parent && parent.sha) })).filter(parent => parent.sha)
    : [];
  const mapped = {
    sha: cleanString(commit.sha || commit.id),
    commit: {
      message: cleanString(inner.message),
      author: {
        name: cleanString(innerAuthor.name),
        date: cleanString(innerAuthor.date),
      },
    },
    author: mapGiteaCommitAuthor(commit.author),
    parents,
  };
  if (commit.stats && typeof commit.stats === 'object') {
    mapped.stats = {
      additions: cleanNumber(commit.stats.additions),
      deletions: cleanNumber(commit.stats.deletions),
      total: cleanNumber(commit.stats.total, cleanNumber(commit.stats.additions) + cleanNumber(commit.stats.deletions)),
    };
  }
  if (Array.isArray(commit.files)) {
    mapped.files = commit.files.map(file => ({
      filename: cleanString(file.filename),
      additions: cleanNumber(file.additions),
      deletions: cleanNumber(file.deletions),
      changes: cleanNumber(file.changes, cleanNumber(file.additions) + cleanNumber(file.deletions)),
      status: cleanString(file.status) || 'modified',
      ...(file.patch !== undefined ? { patch: file.patch } : {}),
      ...(file.previous_filename ? { previous_filename: file.previous_filename } : {}),
    }));
  }
  return mapped;
}

function mapGiteaBranchToGitHubBranch(branch) {
  if (!branch || typeof branch !== 'object') return branch;
  const commit = branch.commit && typeof branch.commit === 'object' ? branch.commit : {};
  return {
    name: cleanString(branch.name),
    commit: { sha: cleanString(commit.sha || commit.id) },
  };
}

function mapGiteaPullToGitHubPR(pull) {
  if (!pull || typeof pull !== 'object') return pull;
  const head = pull.head && typeof pull.head === 'object' ? pull.head : {};
  const base = pull.base && typeof pull.base === 'object' ? pull.base : {};
  return {
    id: pull.id,
    number: pull.number != null ? pull.number : pull.id,
    title: cleanString(pull.title),
    body: pull.body == null ? '' : String(pull.body),
    state: pull.state === 'closed' ? 'closed' : 'open',
    merged: Boolean(pull.merged || pull.merged_at),
    user: mapGiteaCommitAuthor(pull.user),
    head: { ref: cleanString(head.ref), sha: cleanString(head.sha) },
    base: { ref: cleanString(base.ref) },
    created_at: cleanString(pull.created_at),
    updated_at: cleanString(pull.updated_at),
    html_url: cleanString(pull.html_url),
    draft: Boolean(pull.draft),
    mergeable: pull.mergeable,
    mergeable_state: pull.mergeable_state,
    additions: pull.additions,
    deletions: pull.deletions,
    changed_files: pull.changed_files,
    commits: pull.commits,
  };
}

function mapGiteaIssueToGitHubIssue(issue) {
  if (!issue || typeof issue !== 'object') return issue;
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map(label => ({
      name: cleanString(label && label.name),
      color: cleanString(label && label.color) || 'ededed',
    })).filter(label => label.name)
    : [];
  const assignees = Array.isArray(issue.assignees)
    ? issue.assignees
    : (issue.assignee ? [issue.assignee] : []);
  return {
    id: issue.id,
    number: issue.number != null ? issue.number : issue.id,
    title: cleanString(issue.title),
    body: issue.body == null ? '' : String(issue.body),
    state: issue.state === 'closed' ? 'closed' : 'open',
    user: mapGiteaCommitAuthor(issue.user),
    labels,
    assignees: assignees
      .filter(assignee => assignee && assignee.login)
      .map(assignee => ({ login: cleanString(assignee.login), avatar_url: cleanString(assignee.avatar_url) })),
    created_at: cleanString(issue.created_at),
    updated_at: cleanString(issue.updated_at),
    html_url: cleanString(issue.html_url),
  };
}

function mapGiteaReleaseToGitHubRelease(release) {
  if (!release || typeof release !== 'object') return release;
  const assets = Array.isArray(release.assets)
    ? release.assets.map(asset => ({
      name: cleanString(asset.name),
      size: cleanNumber(asset.size),
      browser_download_url: cleanString(asset.browser_download_url),
      download_count: cleanNumber(asset.download_count),
    }))
    : [];
  return {
    id: release.id,
    tag_name: cleanString(release.tag_name),
    name: cleanString(release.name || release.tag_name),
    body: release.body == null ? '' : String(release.body),
    created_at: cleanString(release.created_at),
    published_at: cleanString(release.published_at || release.created_at),
    prerelease: Boolean(release.prerelease),
    draft: Boolean(release.draft),
    assets,
  };
}

// Client-side commit search: Gitea `/commits` has no free-text query, so the
// caller fetches history and filters it here (same result shape as GitHub).
function filterGiteaCommits(commits, { query = '', author = '', since = '', until = '' } = {}) {
  const list = Array.isArray(commits) ? commits : [];
  const needle = String(query || '').trim().toLowerCase();
  const authorNeedle = String(author || '').trim().toLowerCase();
  const sinceTime = since ? Date.parse(since) : NaN;
  const untilTime = until ? Date.parse(until) : NaN;
  return list.filter(commit => {
    const message = String(commit?.commit?.message || '').toLowerCase();
    const login = String(commit?.author?.login || '').toLowerCase();
    const name = String(commit?.commit?.author?.name || '').toLowerCase();
    if (needle && !message.includes(needle) && !login.includes(needle)) return false;
    if (authorNeedle && !login.includes(authorNeedle) && !name.includes(authorNeedle)) return false;
    const date = Date.parse(commit?.commit?.author?.date || '');
    if (Number.isFinite(sinceTime) && !(date >= sinceTime)) return false;
    if (Number.isFinite(untilTime) && !(date <= untilTime)) return false;
    return true;
  });
}

// --- Endpoint translation: GitHub-style -> Gitea ----------------------------

const REPO_SEGMENT = '[^/]+/[^/]+';

function rewriteQuery(search, { strip = [], rename = {} } = {}) {
  const params = new URLSearchParams(search || '');
  for (const key of strip) params.delete(key);
  for (const [from, to] of Object.entries(rename)) {
    if (params.has(from)) {
      params.set(to, params.get(from));
      if (to !== from) params.delete(from);
    }
  }
  if (!params.has('limit') && !params.has('page')) params.set('limit', String(GITEA_MAX_LIMIT));
  else if (params.has('limit') && !params.has('page')) params.set('page', '1');
  const text = params.toString();
  return text ? `?${text}` : '';
}

function parseJsonBody(body) {
  if (body === undefined || body === null || body === '') return undefined;
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(String(body));
  } catch {
    return undefined;
  }
}

function mapGitHubPermissionToGitea(permission) {
  const value = String(permission || '').toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'push' || value === 'maintain') return 'write';
  return 'read';
}

function mapMergeMethodToGiteaDo(mergeMethod) {
  const value = String(mergeMethod || 'merge').toLowerCase();
  if (value === 'squash') return 'squash';
  if (value === 'rebase') return 'rebase';
  return 'merge';
}

// Translates an internal GitHub-style endpoint into a Gitea API endpoint.
// Returns { endpoint, body, filter } where `body` is the (possibly rewritten)
// request body string|undefined and `filter` is an optional client-side
// post-processing hint ({ commits: { query, author, since, until } }).
// Throws Error(code='gitea-unsupported') when Gitea has no equivalent.
function translateGithubToGitea(githubEndpoint, method = 'GET', rawBody) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const [rawPath, rawSearch] = String(githubEndpoint || '').split('?');
  const path = rawPath || '';
  const query = rawSearch ? `?${rawSearch}` : '';

  const repoMatch = path.match(new RegExp(`^/repos/(${REPO_SEGMENT})(/.*)?$`));
  const repo = repoMatch ? repoMatch[1] : '';
  const suffix = repoMatch ? (repoMatch[2] || '') : '';

  // --- Top-level user endpoints ---
  if (path === '/user' && normalizedMethod === 'GET') {
    return { endpoint: '/user', body: undefined, map: 'user' };
  }
  if (path === '/user/repos') {
    if (normalizedMethod === 'GET') {
      return { endpoint: `/user/repos${rewriteQuery(query, { strip: ['sort', 'direction', 'type', 'visibility'], rename: { per_page: 'limit' } })}`, body: undefined, map: 'repos' };
    }
    if (normalizedMethod === 'POST') {
      const payload = parseJsonBody(rawBody) || {};
      const body = {
        name: payload.name,
        description: payload.description || '',
        private: Boolean(payload.private),
        auto_init: payload.auto_init !== false,
        ...(payload.gitignore_template ? { gitignores: payload.gitignore_template } : {}),
        ...(payload.license_template ? { license: payload.license_template } : {}),
      };
      return { endpoint: '/user/repos', body: JSON.stringify(body), map: 'repo' };
    }
  }
  const userMatch = path.match(/^\/users\/([^/]+)$/);
  if (userMatch && normalizedMethod === 'GET') {
    return { endpoint: `/users/${userMatch[1]}`, body: undefined, map: 'user' };
  }

  // --- Repository endpoints ---
  if (repo) {
    // Single repository
    if ((!suffix || suffix === '') && normalizedMethod === 'GET') {
      return { endpoint: `/repos/${repo}`, body: undefined, map: 'repo' };
    }
    if ((!suffix || suffix === '') && normalizedMethod === 'DELETE') {
      return { endpoint: `/repos/${repo}`, body: undefined, map: 'none' };
    }
    if ((!suffix || suffix === '') && normalizedMethod === 'PATCH') {
      const payload = parseJsonBody(rawBody) || {};
      const body = {};
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.description !== undefined) body.description = payload.description;
      if (payload.private !== undefined) body.private = Boolean(payload.private);
      return { endpoint: `/repos/${repo}`, body: JSON.stringify(body), map: 'repo' };
    }

    // Commits (list + single). Gitea list supports sha/limit/page; free-text
    // search and author filter are applied client-side via `filter`.
    const commitsListMatch = suffix.match(/^\/commits(\/.*)?$/);
    if (commitsListMatch && normalizedMethod === 'GET') {
      const rest = commitsListMatch[1] || '';
      if (rest && rest !== '' && rest !== '/') {
        return { endpoint: `/repos/${repo}/commits${rest}${query}`, body: undefined, map: 'commit' };
      }
      const params = new URLSearchParams(query.replace(/^\?/, ''));
      const filter = {
        query: params.get('q') || '',
        author: params.get('author') || '',
        since: params.get('since') || '',
        until: params.get('until') || '',
      };
      const serverQuery = rewriteQuery(query, { strip: ['q', 'author', 'since', 'until'], rename: { per_page: 'limit' } });
      return {
        endpoint: `/repos/${repo}/commits${serverQuery}`,
        body: undefined,
        map: 'commits',
        filter: (filter.query || filter.author || filter.since || filter.until) ? { commits: filter } : undefined,
      };
    }

    // Branches
    if ((suffix === '/branches' || suffix === '/branches/') && normalizedMethod === 'GET') {
      return { endpoint: `/repos/${repo}/branches${rewriteQuery(query, { rename: { per_page: 'limit' } })}`, body: undefined, map: 'branches' };
    }
    if ((suffix === '/branches' || suffix === '/branches/') && normalizedMethod === 'POST') {
      // Internal callers use the GitHub git-refs shape; accept both.
      const payload = parseJsonBody(rawBody) || {};
      const ref = String(payload.ref || '');
      const newBranchName = payload.new_branch_name || (ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref);
      if (!newBranchName) throw giteaUnsupported('Создание ветки Gitea: не указано имя ветки');
      return {
        endpoint: `/repos/${repo}/branches`,
        body: JSON.stringify({ new_branch_name: newBranchName, old_ref_name: payload.sha || payload.old_ref_name || payload.old_branch_name || 'HEAD' }),
        map: 'branch',
      };
    }
    const branchMatch = suffix.match(/^\/branches\/(.+)$/);
    if (branchMatch && normalizedMethod === 'GET' && !suffix.includes('/commits')) {
      return { endpoint: `/repos/${repo}/branches/${branchMatch[1]}`, body: undefined, map: 'branch' };
    }
    if (branchMatch && normalizedMethod === 'DELETE') {
      return { endpoint: `/repos/${repo}/branches/${branchMatch[1]}`, body: undefined, map: 'none' };
    }

    // GitHub git-refs compatibility (used by GitHub-only flows)
    if (suffix === '/git/refs' && normalizedMethod === 'POST') {
      const payload = parseJsonBody(rawBody) || {};
      const ref = String(payload.ref || '');
      const newBranchName = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
      if (!newBranchName) throw giteaUnsupported('Создание ветки Gitea: некорректный ref');
      return {
        endpoint: `/repos/${repo}/branches`,
        body: JSON.stringify({ new_branch_name: newBranchName, old_ref_name: payload.sha || 'HEAD' }),
        map: 'branch',
      };
    }
    if (suffix.startsWith('/git/refs/heads/') && normalizedMethod === 'DELETE') {
      const branch = suffix.slice('/git/refs/heads/'.length);
      return { endpoint: `/repos/${repo}/branches/${branch}`, body: undefined, map: 'none' };
    }

    // Pull requests
    if ((suffix === '/pulls' || suffix === '/pulls/') && (normalizedMethod === 'GET' || normalizedMethod === 'POST')) {
      if (normalizedMethod === 'GET') {
        return { endpoint: `/repos/${repo}/pulls${rewriteQuery(query, { strip: ['per_page'], rename: {} })}`, body: undefined, map: 'pulls' };
      }
      return { endpoint: `/repos/${repo}/pulls`, body: typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {}), map: 'pull' };
    }
    const pullMatch = suffix.match(/^\/pulls\/(\d+)(\/.*)?$/);
    if (pullMatch) {
      const number = pullMatch[1];
      const rest = pullMatch[2] || '';
      if ((rest === '' || rest === '/') && (normalizedMethod === 'GET' || normalizedMethod === 'PATCH')) {
        return { endpoint: `/repos/${repo}/pulls/${number}`, body: normalizedMethod === 'PATCH' ? (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {})) : undefined, map: 'pull' };
      }
      if ((rest === '/files' || rest === '/files/') && normalizedMethod === 'GET') {
        return { endpoint: `/repos/${repo}/pulls/${number}/files${rewriteQuery(query, { rename: { per_page: 'limit' } })}`, body: undefined, map: 'pullFiles' };
      }
      if ((rest === '/reviews' || rest === '/reviews/') && normalizedMethod === 'POST') {
        return { endpoint: `/repos/${repo}/pulls/${number}/reviews`, body: typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {}), map: 'none' };
      }
      if ((rest === '/merge' || rest === '/merge/') && normalizedMethod === 'PUT') {
        const payload = parseJsonBody(rawBody) || {};
        return {
          endpoint: `/repos/${repo}/pulls/${number}/merge`,
          giteaMethod: 'POST',
          body: JSON.stringify({ Do: mapMergeMethodToGiteaDo(payload.merge_method) }),
          map: 'merge',
        };
      }
    }

    // Issues
    if ((suffix === '/issues' || suffix === '/issues/') && (normalizedMethod === 'GET' || normalizedMethod === 'POST')) {
      if (normalizedMethod === 'GET') {
        return { endpoint: `/repos/${repo}/issues${rewriteQuery(query, { strip: ['per_page'] })}`, body: undefined, map: 'issues' };
      }
      return { endpoint: `/repos/${repo}/issues`, body: typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {}), map: 'issue', needsLabelResolution: true };
    }
    const issueMatch = suffix.match(/^\/issues\/(\d+)(\/.*)?$/);
    if (issueMatch && (normalizedMethod === 'GET' || normalizedMethod === 'PATCH')) {
      const rest = issueMatch[2] || '';
      if (rest === '' || rest === '/') {
        return { endpoint: `/repos/${repo}/issues/${issueMatch[1]}`, body: normalizedMethod === 'PATCH' ? (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {})) : undefined, map: 'issue' };
      }
    }

    // Releases
    if ((suffix === '/releases' || suffix === '/releases/') && (normalizedMethod === 'GET' || normalizedMethod === 'POST')) {
      if (normalizedMethod === 'GET') {
        return { endpoint: `/repos/${repo}/releases${rewriteQuery(query, { strip: ['per_page'] })}`, body: undefined, map: 'releases' };
      }
      const payload = parseJsonBody(rawBody) || {};
      const body = {
        tag_name: payload.tag_name,
        target_commitish: payload.target_commitish,
        name: payload.name,
        body: payload.body || '',
        draft: Boolean(payload.draft),
        prerelease: Boolean(payload.prerelease),
      };
      return { endpoint: `/repos/${repo}/releases`, body: JSON.stringify(body), map: 'release' };
    }
    const releaseIdMatch = suffix.match(/^\/releases\/(\d+)$/);
    if (releaseIdMatch && normalizedMethod === 'GET') {
      return { endpoint: `/repos/${repo}/releases/${releaseIdMatch[1]}`, body: undefined, map: 'release' };
    }
    const releaseTagMatch = suffix.match(/^\/releases\/tags\/(.+)$/);
    if (releaseTagMatch && normalizedMethod === 'GET') {
      return { endpoint: `/repos/${repo}/releases/tags/${releaseTagMatch[1]}`, body: undefined, map: 'release' };
    }

    // Contents (files). Gitea: POST creates, PUT updates, DELETE removes.
    if (suffix.startsWith('/contents/')) {
      if (normalizedMethod === 'GET') {
        return { endpoint: `/repos/${repo}${suffix}${query}`, body: undefined, map: 'none' };
      }
      if (normalizedMethod === 'POST' || normalizedMethod === 'PUT' || normalizedMethod === 'DELETE') {
        return {
          endpoint: `/repos/${repo}${suffix}`,
          body: typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {}),
          map: 'none',
        };
      }
    }

    // Repository labels (used to resolve label names to IDs on issue create).
    if ((suffix === '/labels' || suffix === '/labels/') && normalizedMethod === 'GET') {
      return { endpoint: `/repos/${repo}/labels`, body: undefined, map: 'none' };
    }

    // Collaborators (Gitea: same GET/DELETE path, PUT with read/write/admin)
    if (suffix.startsWith('/collaborators')) {
      if (normalizedMethod === 'GET') {
        const cleanQuery = rewriteQuery(query, { strip: ['affiliation'], rename: { per_page: 'limit' } });
        return { endpoint: `/repos/${repo}${suffix.split('?')[0]}${cleanQuery}`, body: undefined, map: 'collaborators' };
      }
      if (normalizedMethod === 'DELETE') {
        return { endpoint: `/repos/${repo}${suffix.split('?')[0]}`, body: undefined, map: 'none' };
      }
      if (normalizedMethod === 'PUT') {
        const payload = parseJsonBody(rawBody) || {};
        return {
          endpoint: `/repos/${repo}${suffix.split('?')[0]}`,
          body: JSON.stringify({ permission: mapGitHubPermissionToGitea(payload.permission) }),
          map: 'none',
        };
      }
    }

    // No Gitea equivalent: invitations, contributor statistics, raw git database.
    if (suffix.includes('/invitations')) {
      throw giteaUnsupported('Приглашения collaborators не поддерживаются API Gitea: добавьте участника напрямую');
    }
    if (suffix.includes('/stats/') || suffix === '/contributors' || suffix === '/contributors/') {
      throw giteaUnsupported('Статистика contributors отсутствует в API Gitea');
    }
    if (suffix.includes('/git/blobs') || suffix.includes('/git/trees') || suffix.includes('/git/commits')) {
      throw giteaUnsupported('Низкоуровневый git-database API недоступен в Gitea: файловые операции идут через contents API');
    }
    if (suffix.startsWith('/git/refs')) {
      throw giteaUnsupported('Прямая работа с git refs не поддерживается в Gitea: используйте операции с ветками');
    }
    if (suffix.includes('/comments') && normalizedMethod === 'POST') {
      const commentMatch = suffix.match(/^\/(issues)\/(\d+)\/comments\/?$/);
      if (commentMatch) {
        return { endpoint: `/repos/${repo}/issues/${commentMatch[2]}/comments`, body: typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {}), map: 'none' };
      }
    }
  }

  throw giteaUnsupported(`Запрос ${normalizedMethod} ${githubEndpoint} не поддерживается для Gitea`);
}

function applyMap(kind, data, translation) {
  if (data == null) return data;
  switch (kind) {
    case 'none':
      return data;
    case 'user':
      return mapGiteaUserToGitHubUser(data);
    case 'repos':
      return Array.isArray(data) ? data.map(mapGiteaRepoToGitHubRepo) : data;
    case 'repo':
      return mapGiteaRepoToGitHubRepo(data);
    case 'commits': {
      const list = Array.isArray(data) ? data.map(mapGiteaCommitToGitHubCommit) : data;
      if (translation && translation.filter && translation.filter.commits && Array.isArray(list)) {
        return filterGiteaCommits(list, translation.filter.commits);
      }
      return list;
    }
    case 'commit':
      return mapGiteaCommitToGitHubCommit(data);
    case 'branches':
      return Array.isArray(data) ? data.map(mapGiteaBranchToGitHubBranch) : data;
    case 'branch':
      return mapGiteaBranchToGitHubBranch(data);
    case 'pulls':
      return Array.isArray(data) ? data.map(mapGiteaPullToGitHubPR) : data;
    case 'pull':
      return mapGiteaPullToGitHubPR(data);
    case 'pullFiles':
      return Array.isArray(data)
        ? data.map(file => ({
          sha: cleanString(file.sha),
          filename: cleanString(file.filename),
          status: cleanString(file.status) || 'modified',
          additions: cleanNumber(file.additions),
          deletions: cleanNumber(file.deletions),
          changes: cleanNumber(file.changes, cleanNumber(file.additions) + cleanNumber(file.deletions)),
          ...(file.patch !== undefined ? { patch: file.patch } : {}),
          ...(file.previous_filename ? { previous_filename: file.previous_filename } : {}),
        }))
        : data;
    case 'merge':
      return { sha: cleanString(data && (data.sha || data.commit_id)), merged: true, message: cleanString(data && data.message) || 'Pull request merged' };
    case 'issues':
      return Array.isArray(data) ? data.map(mapGiteaIssueToGitHubIssue) : data;
    case 'issue':
      return mapGiteaIssueToGitHubIssue(data);
    case 'releases':
      return Array.isArray(data) ? data.map(mapGiteaReleaseToGitHubRelease) : data;
    case 'release':
      return mapGiteaReleaseToGitHubRelease(data);
    case 'collaborators':
      return Array.isArray(data)
        ? data.map(entry => ({
          login: cleanString(entry.login),
          avatar_url: cleanString(entry.avatar_url),
          html_url: cleanString(entry.html_url),
          role_name: cleanString(entry.role_name || entry.permission),
          permissions: entry.permissions,
        }))
        : data;
    default:
      return data;
  }
}

function giteaErrorFromResponse(status, data, githubEndpoint, method) {
  if (status === 401 || status === 403) {
    const error = new Error('Gitea отклонил токен: проверьте токен и адрес сервера');
    error.code = 'auth';
    error.status = status;
    return error;
  }
  if (status === 404) {
    const error = new Error('Gitea: ресурс не найден. Проверьте имя репозитория и права токена.');
    error.code = 'not-found';
    error.status = status;
    return error;
  }
  const message = (data && (data.message || data.error)) || `Gitea вернул ошибку ${status} для ${method} ${githubEndpoint}`;
  const error = new Error(String(message));
  error.code = 'gitea';
  error.status = status;
  return error;
}

// Provider-aware page request with the same result shape as githubRequestPage:
// { data, status, link, rateLimitRemaining, rateLimitLimit, oauthScopes }.
async function giteaRequestPage({ apiOrigin, token, githubEndpoint, options = {} }) {
  const method = String(options.method || 'GET').toUpperCase();
  const translation = translateGithubToGitea(githubEndpoint, method, options.body);
  const effectiveMethod = translation.giteaMethod || method;
  const url = new URL(translation.endpoint, apiOrigin);
  if (url.origin !== new URL(apiOrigin).origin) throw new Error('Недопустимый адрес Gitea API');

  let response;
  try {
    response = await fetch(url, {
      ...options,
      method: effectiveMethod,
      ...(translation.body !== undefined ? { body: translation.body } : { body: undefined }),
      headers: {
        ...giteaHeaders(token),
        ...(options.headers || {}),
        ...((translation.body !== undefined && effectiveMethod !== 'GET' && effectiveMethod !== 'HEAD')
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
    });
  } catch {
    const error = new Error('Нет соединения с Gitea-сервером.');
    error.code = 'network';
    throw error;
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw giteaErrorFromResponse(response.status, data, githubEndpoint, method);

  // Gitea behind an auth proxy may answer 200 with an HTML login page instead
  // of JSON (e.g. REQUIRE_SIGNIN_VIEW setups). Surface that explicitly.
  if (data == null) {
    const contentType = response.headers.get('content-type') || 'unknown';
    const error = new Error(
      `Gitea вернул пустой ответ для ${method} ${githubEndpoint} (status ${response.status}, ${contentType}). ` +
      'Проверьте токен и то, что API доступно напрямую без веб-авторизации.',
    );
    error.code = 'gitea-empty';
    error.status = response.status;
    throw error;
  }

  return {
    data: applyMap(translation.map, data, translation),
    status: response.status,
    link: response.headers.get('link') || '',
    rateLimitRemaining: response.headers.get('x-ratelimit-remaining') || '',
    rateLimitLimit: response.headers.get('x-ratelimit-limit') || '',
    oauthScopes: '',
  };
}

module.exports = {
  GITEA_API_SUFFIX,
  GITEA_MAX_LIMIT,
  applyMap,
  filterGiteaCommits,
  giteaApiOrigin,
  giteaErrorFromResponse,
  giteaHeaders,
  giteaOrigin,
  giteaRequestPage,
  giteaUnsupported,
  mapGitHubPermissionToGitea,
  mapGiteaBranchToGitHubBranch,
  mapGiteaCommitToGitHubCommit,
  mapGiteaIssueToGitHubIssue,
  mapGiteaPullToGitHubPR,
  mapGiteaReleaseToGitHubRelease,
  mapGiteaRepoToGitHubRepo,
  mapGiteaUserToGitHubUser,
  mapMergeMethodToGiteaDo,
  normalizeGiteaBaseUrl,
  translateGithubToGitea,
};
