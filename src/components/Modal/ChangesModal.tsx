import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  FolderOpen,
  GitCommitHorizontal,
  GitPullRequest,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import { useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Branch, FolderChangesSummary, GitFolderChangesSummary, UploadFolderSummary } from '../../types';
import { suggestCommitMessage } from '../../lib/commitMessage';
import { MarkdownEditor } from '../common/MarkdownEditor';

interface ChangesModalProps {
  branches: Branch[];
  repoFullName: string;
  defaultBranch: string;
}

const STATUS_LABEL = {
  added: 'Добавлен',
  modified: 'Изменён',
  deleted: 'Удалён',
};

function ChangeStats({ summary, gitSummary }: { summary: FolderChangesSummary | null; gitSummary: GitFolderChangesSummary | null }) {
  const additions = gitSummary?.additions;
  const deletions = gitSummary?.deletions;
  return (
    <div className="grid grid-cols-5 border-b border-[var(--line)] bg-[var(--surface-soft)] text-center text-xs font-bold tabular-nums">
      <span className="p-2.5 text-[#5D7659]">+{summary?.added ?? 0}</span>
      <span className="p-2.5 border-x border-[var(--line)] text-[#9A7D2F]">~{summary?.modified ?? 0}</span>
      <span className="p-2.5 text-[#A16C62]">−{summary?.deleted ?? 0}</span>
      <span className="p-2.5 border-l border-[var(--line)] text-[#5D7659]">+{additions ?? '—'}</span>
      <span className="p-2.5 border-l border-[var(--line)] text-[#A16C62]">−{deletions ?? '—'}</span>
    </div>
  );
}

export const ChangesModal: React.FC<ChangesModalProps> = ({ branches, repoFullName, defaultBranch }) => {
  const {
    setChangesOpen,
    selectUploadFolder,
    checkFolderChanges,
    checkGitFolderChanges,
    commitFolderChanges,
    commitGitFolderChanges,
    loading,
  } = useApp();
  const [owner, repo] = repoFullName.split('/');
  const [branch, setBranch] = useState(defaultBranch || branches[0]?.name || 'main');
  const [folder, setFolder] = useState<UploadFolderSummary | null>(null);
  const [summary, setSummary] = useState<FolderChangesSummary | null>(null);
  const [gitSummary, setGitSummary] = useState<GitFolderChangesSummary | null>(null);
  const [message, setMessage] = useState(() => suggestCommitMessage(null));
  const [messageDirty, setMessageDirty] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        if (confirmationOpen) setConfirmationOpen(false);
        else setChangesOpen(false);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [confirmationOpen, loading, setChangesOpen]);

  const close = () => !loading && setChangesOpen(false);

  const refreshFolder = async (nextFolder: UploadFolderSummary, nextBranch: string) => {
    const [remote, local] = await Promise.all([
      checkFolderChanges(owner, repo, nextBranch, nextFolder.path),
      checkGitFolderChanges(nextFolder.path, nextBranch),
    ]);
    setSummary(remote);
    setGitSummary(local);
    if (!messageDirty) setMessage(suggestCommitMessage(local ?? remote));
  };

  const pickFolder = async () => {
    const nextFolder = await selectUploadFolder();
    if (!nextFolder) return;
    setFolder(nextFolder);
    await refreshFolder(nextFolder, branch);
  };

  const refresh = async () => {
    if (!folder) return;
    await refreshFolder(folder, branch);
  };

  const changeBranch = async (nextBranch: string) => {
    setBranch(nextBranch);
    setSummary(null);
    setGitSummary(null);
    if (folder) await refreshFolder(folder, nextBranch);
  };

  const activeSummary = gitSummary ?? summary;
  const changeCount = activeSummary ? activeSummary.added + activeSummary.modified + activeSummary.deleted : 0;
  const canUseLocalGit = Boolean(gitSummary?.isGitRepository);
  const canSubmit = Boolean(folder && activeSummary && changeCount > 0 && message.trim());

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setConfirmationOpen(true);
  };

  const confirmOperation = async () => {
    if (!folder || !activeSummary || !message.trim()) return;
    const result = canUseLocalGit
      ? await commitGitFolderChanges(folder.path, branch, message, true)
      : await commitFolderChanges(owner, repo, branch, folder.path, message);
    if (result) setChangesOpen(false);
  };

  const handleMessageKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const nextMessage = `${message.slice(0, textarea.selectionStart)}  ${message.slice(textarea.selectionEnd)}`;
    const nextCursor = textarea.selectionStart + 2;
    setMessageDirty(true);
    setMessage(nextMessage);
    requestAnimationFrame(() => {
      if (!messageRef.current) return;
      messageRef.current.selectionStart = nextCursor;
      messageRef.current.selectionEnd = nextCursor;
    });
  };

  const firstLineLength = (message.split('\n')[0] || '').length;

  const summaryChanges = useMemo(() => activeSummary?.changes || [], [activeSummary]);

  return (
    <div className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-sm grid place-items-center z-50 p-3 sm:p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div className="w-[min(700px,100%)] max-h-[calc(100vh-24px)] overflow-auto bg-[var(--surface)] text-[var(--ink)] rounded-2xl p-6 sm:p-7 relative shadow-[0_18px_50px_rgba(38,23,50,.13)] modal-panel" role="dialog" aria-modal="true" aria-labelledby="changes-title">
        <button className="absolute right-4 top-4 w-9 h-9 grid place-items-center rounded-lg hover:bg-[var(--surface-soft)]" aria-label="Закрыть" title="Закрыть (Esc)" onClick={close} disabled={loading}><X size={19} /></button>
        <div className="w-[47px] h-[47px] rounded-[13px] bg-[var(--surface-strong)] grid place-items-center"><GitCommitHorizontal size={25} /></div>
        <h2 id="changes-title" className="text-[23px] font-semibold mt-4 mb-1">Изменения</h2>
        <p className="text-xs text-[var(--muted)] leading-relaxed mb-5">Сравнение локальной папки с <b className="text-[var(--ink)]">{repoFullName}</b>. Проверьте изменения и отправьте commit в GitHub.</p>

        {confirmationOpen ? (
          <section className="rounded-xl border border-[var(--line)] overflow-hidden" aria-labelledby="confirm-change-title" data-change-confirmation>
            <div className="p-4 bg-[var(--surface-soft)]">
              <div className="flex items-center gap-2 text-[var(--muted)]"><GitPullRequest size={17} /><span className="text-xs font-extrabold tracking-wider">ПОДТВЕРЖДЕНИЕ ОПЕРАЦИИ</span></div>
              <h3 id="confirm-change-title" className="text-base font-semibold mt-3">Вы отправляете изменения</h3>
              <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed">Проверьте, куда попадёт новый commit. Операция будет выполнена в <b className="text-[var(--ink)]">ветку назначения</b>.</p>
            </div>
            <div className="p-4 space-y-2 text-xs">
              <div className="flex justify-between gap-4"><span className="text-[var(--muted)]">Текущая ветка</span><b className="font-mono">{gitSummary?.currentBranch || 'GitHub API'}</b></div>
              <div className="flex justify-between gap-4"><span className="text-[var(--muted)]">Ветка назначения</span><b className="font-mono">{branch}</b></div>
              <div className="flex justify-between gap-4"><span className="text-[var(--muted)]">Файлов</span><b className="tabular-nums">{changeCount}</b></div>
              <div className="flex justify-between gap-4"><span className="text-[var(--muted)]">Строк добавлено</span><b className="tabular-nums text-[#5D7659]">+{gitSummary?.additions ?? 'не рассчитано'}</b></div>
              <div className="flex justify-between gap-4"><span className="text-[var(--muted)]">Строк удалено</span><b className="tabular-nums text-[#A16C62]">−{gitSummary?.deletions ?? 'не рассчитано'}</b></div>
              <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] p-3">
                <span className="text-xs font-bold text-[var(--muted)]">Сообщение commit</span>
                <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-[var(--ink)]">{message}</pre>
              </div>
              <div className="p-3 mt-3 rounded-lg bg-[var(--danger-soft)] text-xs text-[#A16C62]">Перед подтверждением убедитесь, что секреты и временные файлы не попали в список изменений.</div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 p-4 border-t border-[var(--line)]">
              <button type="button" className="min-h-[42px] px-4 py-2 border border-[var(--line)] rounded-lg text-sm font-semibold hover:bg-[var(--surface-soft)]" onClick={() => setConfirmationOpen(false)} disabled={loading}>Назад</button>
              <button type="button" className="min-h-[42px] px-4 py-2 bg-[var(--ink)] text-[var(--on-ink)] rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90" onClick={() => void confirmOperation()} disabled={loading}><Check size={16} /> Подтвердить</button>
            </div>
          </section>
        ) : (
          <form onSubmit={submit}>
            <label className="block text-xs font-bold">Ветка назначения
              <input list="changes-branches" value={branch} onChange={(event) => void changeBranch(event.target.value)} className="focus-surface block w-full h-[42px] border border-[var(--line)] bg-[var(--surface-soft)] rounded-lg px-3 text-sm mt-2" />
              <datalist id="changes-branches">{branches.map(item => <option key={item.name} value={item.name} />)}</datalist>
            </label>

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={pickFolder} disabled={loading} className="flex-1 min-h-[42px] border border-[var(--line)] bg-[var(--surface-soft)] rounded-lg px-3 text-sm flex items-center gap-2 text-left hover:bg-[var(--surface-strong)] disabled:opacity-40"><FolderOpen size={16} className="flex-none text-[var(--muted)]" /><span className="truncate text-[var(--muted)]">{folder?.path || 'Выбрать папку проекта'}</span></button>
              <button type="button" onClick={() => void refresh()} disabled={loading || !folder} className="w-[42px] min-h-[42px] flex-none border border-[var(--line)] bg-[var(--surface-soft)] rounded-lg grid place-items-center hover:bg-[var(--surface-strong)] disabled:opacity-40" aria-label="Проверить заново" title="Проверить изменения заново"><RefreshCw size={16} /></button>
            </div>

            {!canUseLocalGit && folder && <p className="mt-2 text-xs text-[var(--muted)]">Git-репозиторий в папке не найден. Отправка будет выполнена безопасно через GitHub API.</p>}

            {activeSummary && (
              <div className="mt-4 border border-[var(--line)] rounded-lg overflow-hidden" data-changes-summary>
                <ChangeStats summary={activeSummary} gitSummary={gitSummary} />
                <div className="grid grid-cols-5 px-3 py-1.5 text-xs text-[var(--muted)] text-center"><span>файлы +</span><span>файлы ~</span><span>файлы −</span><span>строки +</span><span>строки −</span></div>
                <div className="max-h-[210px] overflow-auto text-xs">
                  {changeCount === 0 ? <p className="p-3 text-[var(--muted)]">Изменений нет</p> : summaryChanges.map(change => <div key={`${change.status}:${change.path}`} className="grid grid-cols-[82px_1fr] gap-2 px-3 py-2 border-t border-[var(--line)]"><b>{STATUS_LABEL[change.status]}</b><span className="truncate font-mono text-[var(--muted)]">{change.path}</span></div>)}
                </div>
                {activeSummary.warnings.length > 0 && <p className="p-3 border-t border-[var(--line)] text-xs text-[#A16C62]">{activeSummary.warnings.slice(0, 3).join('; ')}</p>}
              </div>
            )}

            <label className="block text-xs font-bold mt-4" htmlFor="commit-message">Сообщение commit
              <MarkdownEditor
                id="commit-message"
                ref={messageRef}
                value={message}
                onValueChange={(nextMessage) => {
                  setMessageDirty(true);
                  setMessage(nextMessage);
                }}
                onKeyDown={handleMessageKeyDown}
                rows={7}
                spellCheck
                aria-describedby="commit-message-hint commit-message-count"
                className="min-h-[154px] leading-relaxed"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-xs text-[var(--muted)]">
              <p id="commit-message-hint">Первая строка — краткий заголовок. После пустой строки добавьте подробности. Tab вставляет два пробела.</p>
              <span id="commit-message-count" className="tabular-nums">{message.length} символов</span>
            </div>
            {firstLineLength > 72 && <p className="mt-1 text-xs text-[#A16C62]">Первая строка длиннее рекомендуемых 72 символов — её будет сложнее читать в истории.</p>}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
              <button type="button" className="min-h-[42px] px-4 py-2 border border-[var(--line)] rounded-lg text-sm font-semibold hover:bg-[var(--surface-soft)]" onClick={close}>Отмена</button>
              <button type="submit" disabled={loading || !canSubmit} className="min-h-[42px] px-4 py-2 bg-[var(--ink)] text-[var(--on-ink)] rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90">
                <Send size={16} />
                Создать commit и отправить
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
