import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  githubErrorMessage,
  isAllowedGitHubDownloadUrl,
  isValidIssueNumber,
  isValidGitSha,
  isValidGitRef,
  isValidCommitLimit,
} = require('./githubErrors.cjs');

describe('githubErrorMessage', () => {
  it('explains missing delete_repo permission', () => {
    expect(githubErrorMessage(403, 'Must have admin rights to Repository.', '/repos/me/demo', 'DELETE')).toContain('delete_repo');
  });

  it('keeps normal GitHub messages unchanged', () => {
    expect(githubErrorMessage(404, 'Not Found')).toBe('Not Found');
  });
});

describe('isAllowedGitHubDownloadUrl', () => {
  it('allows GitHub release URLs and their asset host', () => {
    expect(isAllowedGitHubDownloadUrl('https://github.com/Appappars/Gitora/releases/download/v1.0/Gitora.exe')).toBe(true);
    expect(isAllowedGitHubDownloadUrl('https://objects.githubusercontent.com/github-production-release-asset-2e65be/asset')).toBe(true);
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
});
