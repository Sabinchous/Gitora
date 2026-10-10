import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  githubErrorMessage,
  githubErrorCode,
  isAllowedGitHubDownloadUrl,
  isValidIssueNumber,
  isValidGitSha,
  isValidGitRef,
  isValidCommitLimit,
  isValidGitHubUsername,
  isValidInvitationId,
  isValidCollaboratorPermission,
  githubTeamState,
} = require('./githubErrors.cjs');

describe('githubErrorMessage', () => {
  it('explains missing delete_repo permission', () => {
    expect(githubErrorMessage(403, 'Must have admin rights to Repository.', '/repos/me/demo', 'DELETE')).toContain('delete_repo');
  });

  it('keeps normal GitHub messages unchanged', () => {
    expect(githubErrorMessage(404, 'Not Found')).toBe('Not Found');
  });

  it('turns Team API failures into actionable messages', () => {
    expect(githubErrorMessage(403, 'forbidden', '/repos/me/demo/collaborators')).toContain('Administration: write');
    expect(githubErrorMessage(403, 'forbidden', '/repos/me/demo/collaborators/alex', 'DELETE')).toContain('Administration: write');
    expect(githubErrorMessage(404, 'Not Found', '/repos/me/demo/invitations/42')).toContain('Приглашение не найдено');
    expect(githubErrorMessage(422, 'User is already a collaborator', '/repos/me/demo/collaborators/alex', 'PUT')).toContain('уже имеет доступ');
    expect(githubErrorMessage(202, '', '/repos/me/demo/stats/contributors')).toContain('рассчитывает статистику');
  });

  it('turns Pull Request failures into safe next steps', () => {
    expect(githubErrorMessage(403, 'forbidden', '/repos/me/demo/pulls/7/reviews', 'POST')).toContain('Pull requests: write');
    expect(githubErrorMessage(403, 'forbidden', '/repos/me/demo/pulls/7/merge', 'PUT')).toContain('Contents: write');
    expect(githubErrorMessage(409, 'conflict', '/repos/me/demo/pulls/7/merge', 'PUT')).toContain('конфликт');
    expect(githubErrorMessage(405, 'method not allowed', '/repos/me/demo/pulls/7/merge', 'PUT')).toContain('не может объединить');
  });
});

describe('githubErrorCode', () => {
  it('classifies expired or invalid credentials', () => {
    expect(githubErrorCode(401, 'Bad credentials')).toBe('auth');
  });

  it('classifies repository permission failures', () => {
    expect(githubErrorCode(403, 'Resource not accessible by personal access token', '/user/repos')).toBe('permissions');
    expect(githubErrorCode(403, 'Resource not accessible by integration', '/repos/me/demo/contents/hello.py')).toBe('permissions');
    expect(githubErrorCode(403, 'Resource not accessible by integration', '/repos/me/demo/pulls/7/merge')).toBe('permissions');
  });

  it('classifies GitHub service failures', () => {
    expect(githubErrorCode(503, 'Service unavailable')).toBe('github');
  });
});

describe('isAllowedGitHubDownloadUrl', () => {
  it('allows GitHub release URLs and their asset host', () => {
    expect(isAllowedGitHubDownloadUrl('https://github.com/Appappars/Gitora/releases/download/v1.0/Gitora.exe')).toBe(true);
    expect(isAllowedGitHubDownloadUrl('https://objects.githubusercontent.com/github-production-release-asset-2e65be/asset')).toBe(true);
    expect(isAllowedGitHubDownloadUrl('https://release-assets.githubusercontent.com/github-production-release-asset-2e65be/asset')).toBe(true);
  });

  it('rejects non-HTTPS and non-GitHub URLs', () => {
    expect(isAllowedGitHubDownloadUrl('http://github.com/example')).toBe(false);
    expect(isAllowedGitHubDownloadUrl('https://example.com/file')).toBe(false);
    expect(isAllowedGitHubDownloadUrl('file:///C:/secret.txt')).toBe(false);
    expect(isAllowedGitHubDownloadUrl('not a URL')).toBe(false);
  });
});

describe('IPC path input validators', () => {
  it('accepts only positive safe issue numbers', () => {
    expect(isValidIssueNumber(12)).toBe(true);
    expect(isValidIssueNumber('12')).toBe(true);
    expect(isValidIssueNumber('0')).toBe(false);
    expect(isValidIssueNumber('12/../../users')).toBe(false);
    expect(isValidIssueNumber('1e3')).toBe(false);
  });

  it('accepts only full hexadecimal commit SHAs', () => {
    expect(isValidGitSha('0123456789abcdef0123456789abcdef01234567')).toBe(true);
    expect(isValidGitSha('0123456')).toBe(false);
    expect(isValidGitSha('z'.repeat(40))).toBe(false);
  });

  it('allows hierarchical branch names but rejects unsafe Git refs', () => {
    expect(isValidGitRef('feature/my-change')).toBe(true);
    expect(isValidGitRef('release/2026.07')).toBe(true);
    expect(isValidGitRef('feature//broken')).toBe(false);
    expect(isValidGitRef('../main')).toBe(false);
    expect(isValidGitRef('feature/secret..key')).toBe(false);
    expect(isValidGitRef('feature/branch.lock')).toBe(false);
  });

  it('accepts commit limits only within the supported range', () => {
    expect(isValidCommitLimit(25)).toBe(true);
    expect(isValidCommitLimit(100)).toBe(true);
    expect(isValidCommitLimit(24)).toBe(false);
    expect(isValidCommitLimit(101)).toBe(false);
    expect(isValidCommitLimit('50')).toBe(false);
  });

  it('validates Team identifiers and permissions', () => {
    expect(isValidGitHubUsername('octocat')).toBe(true);
    expect(isValidGitHubUsername('bad/name')).toBe(false);
    expect(isValidGitHubUsername('ends-')).toBe(false);
    expect(isValidInvitationId(42)).toBe(true);
    expect(isValidInvitationId('0')).toBe(false);
    expect(isValidCollaboratorPermission('maintain')).toBe(true);
    expect(isValidCollaboratorPermission('owner')).toBe(false);
  });

  it('keeps Team HTTP states explicit instead of treating protected data as empty', () => {
    expect(githubTeamState(202)).toBe('pending');
    expect(githubTeamState(204)).toBe('empty');
    expect(githubTeamState(403)).toBe('forbidden');
    expect(githubTeamState(404)).toBe('error');
    expect(githubTeamState(422)).toBe('error');
    expect(githubTeamState(200, [{ login: 'octocat' }])).toBe('loaded');
  });
});
