import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  detectGitHubAuthType,
  buildGitHubPermissionChecks,
  githubWriteRequirement,
  parseGitHubHeaderList,
  parseGitHubPermissionHeader,
  repositoryFromEndpoint,
} = require('./githubAuth.cjs');

describe('GitHub authentication diagnostics', () => {
  it('identifies token families without exposing token values', () => {
    expect(detectGitHubAuthType('github_pat_example')).toBe('Fine-grained PAT');
    expect(detectGitHubAuthType('ghp_example')).toBe('Classic PAT');
    expect(detectGitHubAuthType('gho_example')).toBe('OAuth token');
    expect(detectGitHubAuthType('ghs_example')).toBe('GitHub App installation token');
    expect(detectGitHubAuthType('')).toBe('None');
  });

  it('maps GitHub writes to the permission they require', () => {
    expect(githubWriteRequirement('PUT', '/repos/demo/test/contents/README.md')).toBe('Contents: write');
    expect(githubWriteRequirement('POST', '/repos/demo/test/git/commits')).toBe('Contents: write');
    expect(githubWriteRequirement('POST', '/repos/demo/test/issues')).toBe('Issues: write');
    expect(githubWriteRequirement('POST', '/repos/demo/test/issues/4/comments')).toBe('Issues: write or Pull requests: write');
    expect(githubWriteRequirement('POST', '/repos/demo/test/pulls')).toBe('Pull requests: write');
    expect(githubWriteRequirement('POST', '/repos/demo/test/pulls/4/reviews')).toBe('Pull requests: write');
    expect(githubWriteRequirement('PATCH', '/repos/demo/test/pulls/4')).toBe('Pull requests: write');
    expect(githubWriteRequirement('PUT', '/repos/demo/test/pulls/4/merge')).toBe('Contents: write');
    expect(githubWriteRequirement('PUT', '/repos/demo/test/collaborators/alex')).toBe('Administration: write');
    expect(githubWriteRequirement('DELETE', '/repos/demo/test/invitations/42')).toBe('Administration: write');
    expect(githubWriteRequirement('GET', '/repos/demo/test')).toBe('');
  });

  it('parses scopes and repository paths safely', () => {
    expect(parseGitHubHeaderList('repo, read:user, repo')).toEqual(['repo', 'read:user', 'repo']);
    expect(parseGitHubPermissionHeader('contents=write, issues=read')).toEqual({ contents: 'write', issues: 'read' });
    expect(repositoryFromEndpoint('/repos/demo/test/contents/a.txt')).toBe('demo/test');
    expect(repositoryFromEndpoint('/user/repos')).toBe('');
  });

  it('reports available, missing, and unknown repository permissions', () => {
    const checks = buildGitHubPermissionChecks({
      permissions: { push: true, pull: true, admin: false },
      acceptedPermissions: { contents: 'write', issues: 'read' },
    });
    expect(checks.find(check => check.permission === 'Contents: write')).toMatchObject({ status: 'available' });
    expect(checks.find(check => check.permission === 'Issues: write')).toMatchObject({ status: 'missing' });
    expect(checks.find(check => check.permission === 'Pull requests: write')).toMatchObject({ status: 'unknown' });
    expect(checks.find(check => check.permission === 'Metadata: read')).toMatchObject({ status: 'available' });
    expect(checks.find(check => check.permission === 'Administration: write')).toMatchObject({ status: 'missing' });
  });
});
