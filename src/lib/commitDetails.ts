import { CommitDetails, GitHubCommit } from '../types';

export type DiffLineKind = 'addition' | 'deletion' | 'context';

export function mapCommitDetails(commit?: GitHubCommit): CommitDetails | undefined {
  if (!commit?.stats && !commit?.files) return undefined;

  const filesChanged = (commit.files || []).map(file => ({
    filename: file.filename,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    status: file.status,
    patch: file.patch,
    previousFilename: file.previous_filename,
  }));

  return {
    files: commit.files?.length ?? 0,
    plus: commit.stats?.additions ?? filesChanged.reduce((total, file) => total + file.additions, 0),
    minus: commit.stats?.deletions ?? filesChanged.reduce((total, file) => total + file.deletions, 0),
    filesChanged,
  };
}

export function getDiffLineKind(line: string): DiffLineKind {
  if (line.startsWith('+') && !line.startsWith('+++')) return 'addition';
  if (line.startsWith('-') && !line.startsWith('---')) return 'deletion';
  return 'context';
}
