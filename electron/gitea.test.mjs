import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  filterGiteaCommits,
  mapGiteaBranchToGitHubBranch,
  mapGiteaCommitToGitHubCommit,
  mapGiteaIssueToGitHubIssue,
  mapGiteaPullToGitHubPR,
  mapGiteaReleaseToGitHubRelease,
  mapGiteaRepoToGitHubRepo,
  mapGiteaUserToGitHubUser,
  mapGitHubPermissionToGitea,
  normalizeGiteaBaseUrl,
  translateGithubToGitea,
  giteaRequestPage,
} = require('./gitea.cjs');

describe('Gitea base URL normalization', () => {
  it('accepts a plain host URL', () => {
    expect(normalizeGiteaBaseUrl('https://gitea.example.com')).toEqual({
      baseUrl: 'https://gitea.example.com',
      apiOrigin: 'https://gitea.example.com/api/v1',
    });
  });

  it('keeps path prefixes and strips /api/v1 and trailing slashes', () => {
    expect(normalizeGiteaBaseUrl('https://example.com/git///')).toMatchObject({
      baseUrl: 'https://example.com/git',
    });
    expect(normalizeGiteaBaseUrl('https://example.com/git/api/v1')).toMatchObject({
      baseUrl: 'https://example.com/git',
      apiOrigin: 'https://example.com/git/api/v1',
    });
  });

  it('rejects non-http URLs, credentials and garbage', () => {
    expect(() => normalizeGiteaBaseUrl('')).toThrow();
    expect(() => normalizeGiteaBaseUrl('ftp://example.com')).toThrow();
    expect(() => normalizeGiteaBaseUrl('https://user:pass@example.com')).toThrow();
    expect(() => normalizeGiteaBaseUrl('not a url')).toThrow();
  });
});

describe('Gitea response mappers', () => {
  it('maps users, repos, branches and commits to GitHub shapes', () => {
    expect(mapGiteaUserToGitHubUser({ login: 'alex', full_name: 'Alex', avatar_url: 'a', html_url: 'h' }))
      .toMatchObject({ login: 'alex', name: 'Alex' });

    expect(mapGiteaRepoToGitHubRepo({
      id: 7, name: 'demo', full_name: 'alex/demo', private: true,
      description: null, stars_count: 3, forks_count: 1, updated_at: '2026-01-01',
      default_branch: '', html_url: 'h', archived: false, empty: false,
      owner: { login: 'alex' }, permissions: { admin: true, push: true, pull: true },
    })).toMatchObject({
      full_name: 'alex/demo', private: true, stargazers_count: 3,
      default_branch: 'main', permissions: { push: true, admin: true },
    });

    expect(mapGiteaBranchToGitHubBranch({ name: 'main', commit: { id: 'abc123' } }))
      .toEqual({ name: 'main', commit: { sha: 'abc123' } });

    expect(mapGiteaCommitToGitHubCommit({
      sha: 'abc', commit: { message: 'fix', author: { name: 'A', date: '2026-01-01' } },
      author: null, parents: [{ sha: 'def' }],
    })).toMatchObject({ sha: 'abc', author: null, parents: [{ sha: 'def' }] });
  });

  it('maps pulls, issues and releases', () => {
    expect(mapGiteaPullToGitHubPR({
      id: 1, number: 5, title: 't', body: null, state: 'open',
      user: { login: 'alex' }, head: { ref: 'f', sha: 'abc' }, base: { ref: 'main' },
      merged_at: '2026-01-02',
    })).toMatchObject({ number: 5, merged: true, head: { ref: 'f', sha: 'abc' } });

    expect(mapGiteaIssueToGitHubIssue({
      id: 2, number: 9, title: 'bug', state: 'closed',
      labels: [{ name: 'bug', color: 'ff0000' }], assignee: { login: 'alex' },
    })).toMatchObject({ number: 9, state: 'closed', labels: [{ name: 'bug', color: 'ff0000' }] });

    expect(mapGiteaReleaseToGitHubRelease({
      tag_name: 'v1', name: '', body: null, created_at: '2026-01-01',
      prerelease: false, assets: [{ name: 'a.zip', size: 10, download_count: 2, browser_download_url: 'u' }],
    })).toMatchObject({ tag_name: 'v1', assets: [{ name: 'a.zip', download_count: 2 }] });
  });
});

describe('GitHub-style endpoint translation', () => {
  it('translates paginated lists from per_page to limit', () => {
    const repos = translateGithubToGitea('/user/repos?per_page=100&sort=updated', 'GET');
    expect(repos.endpoint).toContain('/user/repos');
    expect(repos.endpoint).toContain('limit=100');
    expect(repos.endpoint).not.toContain('per_page');

    const branches = translateGithubToGitea('/repos/a/b/branches?per_page=100', 'GET');
    expect(branches.endpoint).toBe('/repos/a/b/branches?limit=100&page=1');
  });

  it('keeps commit sha filter server-side and moves text search client-side', () => {
    const list = translateGithubToGitea('/repos/a/b/commits?sha=main&per_page=30', 'GET');
    expect(list.endpoint).toContain('sha=main');
    expect(list.filter).toBeUndefined();

    const search = translateGithubToGitea('/repos/a/b/commits?per_page=30&q=fix&author=alex', 'GET');
    expect(search.endpoint).not.toContain('q=fix');
    expect(search.filter).toEqual({ commits: { query: 'fix', author: 'alex', since: '', until: '' } });
  });

  it('translates git-refs branch creation to Gitea branches', () => {
    const created = translateGithubToGitea(
      '/repos/a/b/git/refs', 'POST',
      JSON.stringify({ ref: 'refs/heads/feature', sha: 'abc123' }),
    );
    expect(created.endpoint).toBe('/repos/a/b/branches');
    expect(JSON.parse(created.body)).toMatchObject({ new_branch_name: 'feature', old_ref_name: 'abc123' });

    const deleted = translateGithubToGitea('/repos/a/b/git/refs/heads/feature', 'DELETE');
    expect(deleted.endpoint).toBe('/repos/a/b/branches/feature');
  });

  it('translates merges to POST with Do and maps collaborator permissions', () => {
    const merge = translateGithubToGitea('/repos/a/b/pulls/3/merge', 'PUT', JSON.stringify({ merge_method: 'squash' }));
    expect(merge.giteaMethod).toBe('POST');
    expect(JSON.parse(merge.body)).toEqual({ Do: 'squash' });
    expect(mapGitHubPermissionToGitea('push')).toBe('write');
    expect(mapGitHubPermissionToGitea('pull')).toBe('read');
    expect(mapGitHubPermissionToGitea('admin')).toBe('admin');
  });

  it('rejects endpoints without a Gitea equivalent', () => {
    for (const endpoint of [
      '/repos/a/b/invitations?per_page=100',
      '/repos/a/b/stats/contributors',
      '/repos/a/b/contributors?anon=1&per_page=100',
    ]) {
      let error = null;
      try {
        translateGithubToGitea(endpoint, 'GET');
      } catch (candidate) {
        error = candidate;
      }
      expect(error?.code).toBe('gitea-unsupported');
    }
  });
});

describe('client-side commit search', () => {
  const commits = [
    { sha: '1', commit: { message: 'Fix login', author: { name: 'Alex', date: '2026-02-01T00:00:00Z' } }, author: { login: 'alex' } },
    { sha: '2', commit: { message: 'Update docs', author: { name: 'Sam', date: '2026-01-01T00:00:00Z' } }, author: { login: 'sam' } },
  ];

  it('filters by text, author and date range', () => {
    expect(filterGiteaCommits(commits, { query: 'fix' }).map(commit => commit.sha)).toEqual(['1']);
    expect(filterGiteaCommits(commits, { author: 'sam' }).map(commit => commit.sha)).toEqual(['2']);
    expect(filterGiteaCommits(commits, { since: '2026-01-15' }).map(commit => commit.sha)).toEqual(['1']);
    expect(filterGiteaCommits(commits, { until: '2026-01-15' }).map(commit => commit.sha)).toEqual(['2']);
  });
});

describe('Gitea empty responses', () => {
  it('reports a clear error when the server answers 200 without JSON', async () => {
    const originalFetch = globalThis.fetch;
    let seenUrl = '';
    globalThis.fetch = async (url) => {
      seenUrl = String(url);
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'text/html' : '') },
        json: async () => { throw new SyntaxError('Unexpected token'); },
      };
    };
    try {
      let error = null;
      try {
        await giteaRequestPage({ apiOrigin: 'https://gitea.example.com/api/v1', token: 'x', githubEndpoint: '/user', options: {} });
      } catch (candidate) { error = candidate; }
      expect(seenUrl).toBe('https://gitea.example.com/api/v1/user');
      expect(error && error.code).toBe('gitea-empty');
      expect(String(error && error.message)).toContain('status 200');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
