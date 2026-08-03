import type { FolderChangesSummary, GitFolderChangesSummary } from '../types';

type CommitMessageSummary = FolderChangesSummary | GitFolderChangesSummary;

const MAX_FILE_NAMES = 5;
const MAX_SUBJECT_LENGTH = 72;

function shortenSubject(subject: string) {
  return subject.length <= MAX_SUBJECT_LENGTH
    ? subject
    : `${subject.slice(0, MAX_SUBJECT_LENGTH - 1).trimEnd()}…`;
}

function formatFileNames(summary: CommitMessageSummary) {
  const names = summary.changes.slice(0, MAX_FILE_NAMES).map(change => change.path);
  const remaining = summary.changes.length - names.length;
  return remaining > 0 ? `${names.join(', ')} и ещё ${remaining}` : names.join(', ');
}

export function suggestCommitMessage(summary: CommitMessageSummary | null): string {
  if (!summary || summary.changes.length === 0) {
    return 'Обновить файлы проекта';
  }

  const subject = summary.changes.length === 1
    ? shortenSubject(`Обновить ${summary.changes[0].path}`)
    : 'Обновить файлы проекта';
  const additions = 'additions' in summary ? `+${summary.additions}` : 'не рассчитано';
  const deletions = 'deletions' in summary ? `-${summary.deletions}` : 'не рассчитано';

  return [
    subject,
    '',
    `Изменено файлов: ${summary.changes.length}`,
    `Добавлено строк: ${additions}`,
    `Удалено строк: ${deletions}`,
    `Затронутые файлы: ${formatFileNames(summary)}`,
  ].join('\n');
}
