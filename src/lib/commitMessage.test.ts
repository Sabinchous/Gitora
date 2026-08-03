import { describe, expect, it } from 'vitest';
import { suggestCommitMessage } from './commitMessage';
import type { GitFolderChangesSummary } from '../types';

const baseSummary: GitFolderChangesSummary = {
  folderPath: 'C:/project',
  branch: 'main',
  targetBranch: 'main',
  currentBranch: 'main',
  isGitRepository: true,
  warnings: [],
  added: 1,
  modified: 1,
  deleted: 0,
  additions: 12,
  deletions: 4,
  changes: [
    { path: 'src/App.tsx', status: 'modified' },
    { path: 'README.md', status: 'added' },
  ],
};

describe('suggestCommitMessage', () => {
  it('creates a readable default when there is no summary', () => {
    expect(suggestCommitMessage(null)).toBe('Обновить файлы проекта');
  });

  it('uses a single changed file in the subject', () => {
    expect(suggestCommitMessage({ ...baseSummary, changes: [{ path: 'README.md', status: 'modified' }] }))
      .toContain('Обновить README.md\n\n');
  });

  it('includes multiline statistics and changed file names', () => {
    const message = suggestCommitMessage(baseSummary);
    expect(message).toContain('\n\n');
    expect(message).toContain('Изменено файлов: 2');
    expect(message).toContain('Добавлено строк: +12');
    expect(message).toContain('Удалено строк: -4');
    expect(message).toContain('src/App.tsx, README.md');
  });

  it('limits the automatically generated file list', () => {
    const changes = Array.from({ length: 7 }, (_, index) => ({ path: `file-${index}.ts`, status: 'modified' as const }));
    const message = suggestCommitMessage({ ...baseSummary, changes });
    expect(message).toContain('file-0.ts, file-1.ts, file-2.ts, file-3.ts, file-4.ts и ещё 2');
    expect(message).not.toContain('file-6.ts');
  });
});
