import { describe, expect, it } from 'vitest';
import { getDiffLineKind, mapCommitDetails } from './commitDetails';
import { GitHubCommit } from '../types';

const commit = (overrides: Partial<GitHubCommit> = {}): GitHubCommit => ({
  sha: 'abc123',
  commit: {
    message: 'Update files',
    author: { name: 'User', date: '2026-07-27T12:00:00Z' },
  },
  author: null,
  parents: [],
  ...overrides,
});

describe('commitDetails', () => {
  it('maps GitHub stats, file metadata and patches into UI details', () => {
    const details = mapCommitDetails(commit({
      stats: { additions: 8, deletions: 3, total: 11 },
      files: [{
        filename: 'src/App.tsx',
        additions: 8,
        deletions: 3,
        changes: 11,
        status: 'modified',
        patch: '@@ -1 +1 @@',
        previous_filename: 'src/OldApp.tsx',
      }],
    }));

    expect(details).toEqual({
      files: 1,
      plus: 8,
      minus: 3,
      filesChanged: [{
        filename: 'src/App.tsx',
        additions: 8,
        deletions: 3,
        changes: 11,
        status: 'modified',
        patch: '@@ -1 +1 @@',
        previousFilename: 'src/OldApp.tsx',
      }],
    });
  });

  it('uses file totals when GitHub omits stats and keeps absent details idle', () => {
    expect(mapCommitDetails(commit({ files: [{ filename: 'README.md', additions: 2, deletions: 1, changes: 3, status: 'modified' }] }))).toMatchObject({ files: 1, plus: 2, minus: 1 });
    expect(mapCommitDetails(commit())).toBeUndefined();
  });

  it('classifies unified diff lines without treating file headers as changes', () => {
    expect(getDiffLineKind('+new line')).toBe('addition');
    expect(getDiffLineKind('+++ b/src/App.tsx')).toBe('context');
    expect(getDiffLineKind('-old line')).toBe('deletion');
    expect(getDiffLineKind('@@ -1 +1 @@')).toBe('context');
  });
});
