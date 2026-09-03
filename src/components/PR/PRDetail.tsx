import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ExternalLink,
  FileCode2,
  GitMerge,
  GitPullRequest,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { GitHubPR, GitHubPRFile } from '../../types';

type ConfirmationKind = 'approve' | 'merge' | 'close' | 'reopen';

const mergeStateLabels: Record<string, string> = {
  clean: 'Готово к слиянию',
  dirty: 'Есть конфликт',
  blocked: 'Заблокировано правилами GitHub',
  behind: 'Ветка отстаёт от базовой',
  unstable: 'Проверки требуют внимания',
  unknown: 'GitHub ещё проверяет',
  draft: 'Черновик',
};

function formatCount(value: number | undefined) {
  return typeof value === 'number' ? value.toLocaleString('ru-RU') : '—';
}

function getMergeState(pr: GitHubPR) {
  if (pr.draft) return 'draft';
  if (pr.mergeable_state) return pr.mergeable_state;
  if (pr.mergeable === true) return 'clean';
  return 'unknown';
}

function getMergeStateLabel(pr: GitHubPR) {
  const state = getMergeState(pr);
  if (state === 'unknown' || pr.mergeable === null) return mergeStateLabels.unknown;
  if (pr.mergeable === false) return mergeStateLabels.dirty;
  return mergeStateLabels[state] || 'Состояние не определено';
}

function getMergeBlockedReason(pr: GitHubPR) {
  if (pr.merged || pr.state !== 'open') return 'Pull request уже закрыт или объединён.';
  if (pr.draft) return 'Черновик нельзя объединить. Сначала отметьте его готовым на GitHub.';
  if (pr.mergeable === null || getMergeState(pr) === 'unknown') return 'GitHub ещё проверяет возможность слияния. Обновите данные через несколько секунд.';
  if (pr.mergeable === false || getMergeState(pr) === 'dirty') return 'В pull request есть конфликт. Исправьте его в ветке и обновите PR.';
  if (getMergeState(pr) === 'blocked') return 'Слияние заблокировано правилами репозитория: нужны обязательные проверки или одобрение.';
  return '';
}

function getStatusColor(pr: GitHubPR) {
  if (pr.merged) return 'bg-[#8E7CA3]';
  if (pr.state === 'closed') return 'bg-[#A16C62]';
  return 'bg-[#5D7659]';
}

function getStatusText(pr: GitHubPR) {
  if (pr.merged) return 'Слито';
  if (pr.state === 'closed') return 'Закрыт';
  return 'Открыт';
}

function PullRequestConfirmDialog({
  kind,
  pr,
  files,
  busy,
  mergeBlockedReason,
  onCancel,
  onConfirm,
}: {
  kind: ConfirmationKind;
  pr: GitHubPR;
  files: GitHubPRFile[];
  busy: boolean;
  mergeBlockedReason: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isApprove = kind === 'approve';
  const isMerge = kind === 'merge';
  const isClose = kind === 'close';
  const additions = pr.additions ?? files.reduce((total, file) => total + file.additions, 0);
  const deletions = pr.deletions ?? files.reduce((total, file) => total + file.deletions, 0);

  return createPortal(
    <div
      className="modal-overlay fixed inset-0 z-[130] grid place-items-center p-3 backdrop-blur-sm"
      role="presentation"
      onMouseDown={event => event.target === event.currentTarget && !busy && onCancel()}
      data-pr-confirmation={kind}
    >
      <div
        className="modal-panel w-[min(520px,100%)] max-h-[calc(100vh-24px)] overflow-auto rounded-2xl p-5 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${kind}-pr-title`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[var(--muted)]">
              {isApprove ? <ShieldCheck size={18} /> : isMerge ? <GitMerge size={18} /> : isClose ? <XCircle size={18} /> : <RotateCcw size={18} />}
              <span className="text-xs font-extrabold uppercase tracking-[.12em]">PR #{pr.number}</span>
            </div>
            <h2 id={`${kind}-pr-title`} className="mt-3 text-lg font-semibold leading-tight">
              {isApprove
                ? 'Подтвердить безопасность PR?'
                : isMerge
                  ? `Объединить с веткой ${pr.base.ref}?`
                  : isClose
                    ? 'Закрыть pull request?'
                    : 'Переоткрыть pull request?'}
            </h2>
          </div>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-soft)]" onClick={onCancel} disabled={busy} aria-label="Закрыть">
            <X size={17} />
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          <b className="text-[var(--ink)]">{pr.title}</b>
        </p>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-center">
          <div>
            <b className="block text-sm tabular-nums">{formatCount(pr.changed_files ?? files.length)}</b>
            <span className="text-[11px] text-[var(--muted)]">файлов</span>
          </div>
          <div>
            <b className="block text-sm tabular-nums text-[#5D7659]">+{formatCount(additions)}</b>
            <span className="text-[11px] text-[var(--muted)]">добавлено</span>
          </div>
          <div>
            <b className="block text-sm tabular-nums text-[#A16C62]">−{formatCount(deletions)}</b>
            <span className="text-[11px] text-[var(--muted)]">удалено</span>
          </div>
        </div>

        <div className="mt-4 max-h-36 overflow-auto rounded-xl border border-[var(--line)]" aria-label="Файлы pull request">
          {files.length ? files.slice(0, 30).map(file => (
            <div key={`${file.sha}:${file.filename}`} className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2 text-xs last:border-b-0">
              <FileCode2 size={14} className="flex-none text-[var(--muted)]" />
              <span className="min-w-0 flex-1 truncate font-mono">{file.filename}</span>
              <span className="flex-none tabular-nums text-[#5D7659]">+{file.additions}</span>
              <span className="flex-none tabular-nums text-[#A16C62]">−{file.deletions}</span>
            </div>
          )) : (
            <p className="px-3 py-3 text-xs text-[var(--muted)]">Список файлов не загружен. Проверьте изменения на GitHub.</p>
          )}
          {files.length > 30 && <p className="border-t border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">Показаны первые 30 файлов.</p>}
        </div>

        {isApprove ? (
          <p className="mt-4 rounded-lg bg-[var(--surface-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--muted)]">
            Одобрение отправит в GitHub review <b className="text-[var(--ink)]">APPROVE</b>. Это ваше ручное подтверждение после просмотра изменений, а не автоматическая гарантия безопасности кода.
          </p>
        ) : isMerge ? (
          <div className="mt-4 rounded-lg bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[#A16C62]">
            После слияния изменения попадут в <b>{pr.base.ref}</b>. Перед подтверждением проверьте файлы, проверки GitHub и права доступа.
            {mergeBlockedReason && <span className="mt-1 block font-semibold">{mergeBlockedReason}</span>}
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-[var(--surface-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--muted)]">
            {isClose
              ? 'PR будет закрыт без слияния. Ветка и её изменения останутся в репозитории.'
              : 'PR снова станет открытым и вернётся в список открытых запросов.'}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="min-h-10 rounded-lg border border-[var(--line)] px-4 text-sm font-semibold hover:bg-[var(--surface-soft)]" onClick={onCancel} disabled={busy}>Отмена</button>
          <button
            type="button"
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-semibold text-[var(--on-ink)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onConfirm}
            disabled={busy || (isMerge && Boolean(mergeBlockedReason))}
          >
            {busy && <LoaderCircle size={15} className="animate-spin" />}
            {busy
              ? 'Выполняем…'
              : isApprove
                ? 'Одобрить PR'
                : isMerge
                  ? 'Объединить'
                  : isClose
                    ? 'Закрыть PR'
                    : 'Переоткрыть PR'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export const PRDetail: React.FC = () => {
  const {
    selectedPR,
    setSelectedPR,
    project,
    getPullRequest,
    getPullRequestFiles,
    approvePullRequest,
    mergePullRequest,
    updatePullRequestState,
    openExternal,
    providerLabel,
  } = useApp();
  const [detail, setDetail] = useState<GitHubPR | null>(selectedPR);
  const [files, setFiles] = useState<GitHubPRFile[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesUnavailable, setFilesUnavailable] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationKind | null>(null);
  const [busyAction, setBusyAction] = useState<ConfirmationKind | null>(null);
  const [approvedInSession, setApprovedInSession] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    setDetail(selectedPR);
    setFiles([]);
    setFilesUnavailable(false);
    setDetailLoading(Boolean(selectedPR));
    setFilesLoading(Boolean(selectedPR));

    if (!selectedPR || !project) {
      return () => { active = false; };
    }

    const [owner, repo] = project.repo.split('/');
    void Promise.all([
      getPullRequest(owner, repo, selectedPR.number),
      getPullRequestFiles(owner, repo, selectedPR.number),
    ]).then(([nextDetail, nextFiles]) => {
      if (!active) return;
      if (nextDetail) setDetail(nextDetail);
      setFiles(nextFiles || []);
      setFilesUnavailable(!nextFiles);
    }).finally(() => {
      if (!active) return;
      setDetailLoading(false);
      setFilesLoading(false);
    });

    return () => { active = false; };
  }, [selectedPR?.id, project?.id, refreshToken]);

  useEffect(() => {
    setConfirmation(null);
    setBusyAction(null);
    setApprovedInSession(false);
  }, [selectedPR?.id]);

  if (!selectedPR) return null;

  const activePR = detail?.id === selectedPR.id ? detail : selectedPR;
  const [owner, repo] = project?.repo.split('/') || ['', ''];
  const mergeBlockedReason = getMergeBlockedReason(activePR);
  const canReview = activePR.state === 'open' && !activePR.merged && !activePR.draft;
  const canClose = activePR.state === 'open' && !activePR.merged;
  const canReopen = activePR.state === 'closed' && !activePR.merged;

  const handleApprove = async () => {
    if (!owner || !repo) return;
    setBusyAction('approve');
    try {
      if (await approvePullRequest(owner, repo, activePR.number)) {
        setApprovedInSession(true);
        setConfirmation(null);
        setRefreshToken(value => value + 1);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleMerge = async () => {
    if (!owner || !repo || mergeBlockedReason) return;
    setBusyAction('merge');
    try {
      if (await mergePullRequest(owner, repo, activePR.number, activePR.head.sha)) {
        setConfirmation(null);
        setSelectedPR(null);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleStateChange = async (state: 'open' | 'closed') => {
    if (!owner || !repo) return;
    const action = state === 'closed' ? 'close' : 'reopen';
    setBusyAction(action);
    try {
      if (await updatePullRequestState(owner, repo, activePR.number, state)) {
        setDetail(current => current ? { ...current, state } : current);
        setSelectedPR({ ...activePR, state });
        setConfirmation(null);
      }
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="h-full w-[340px] flex-none overflow-auto border-l border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]">
      <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center gap-2">
          <GitPullRequest size={16} className="text-[var(--muted)]" />
          <span className="text-sm font-semibold">PR #{activePR.number}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="grid h-7 w-7 place-items-center rounded text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]" onClick={() => setRefreshToken(value => value + 1)} disabled={detailLoading || filesLoading} aria-label="Обновить PR" title="Обновить PR">
            <RefreshCw size={15} className={detailLoading || filesLoading ? 'animate-spin' : ''} />
          </button>
          <button type="button" className="grid h-7 w-7 place-items-center rounded text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]" onClick={() => setSelectedPR(null)} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="p-4">
        <h2 className="mb-2 text-lg font-semibold">{activePR.title}</h2>

        <div className="mb-4 flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${getStatusColor(activePR)}`} />
          <span className="text-xs text-[var(--muted)]">{getStatusText(activePR)}</span>
          <span className="text-xs text-[var(--muted)]">•</span>
          <span className="text-xs text-[var(--muted)]">{new Date(activePR.created_at).toLocaleDateString('ru-RU')}</span>
        </div>

        <div className="mb-4 flex items-center gap-2 text-xs">
          <span className="rounded bg-[rgba(93,118,89,.1)] px-2 py-1 text-[#5D7659]">{activePR.head.ref}</span>
          <span className="text-[var(--muted)]">→</span>
          <span className="rounded bg-[var(--surface-soft)] px-2 py-1 text-[var(--ink)]">{activePR.base.ref}</span>
        </div>

        {activePR.user && (
          <div className="mb-4 flex items-center gap-2 text-xs text-[var(--muted)]">
            <img src={activePR.user.avatar_url} alt="" className="h-5 w-5 rounded-full" />
            <span>{activePR.user.login}</span>
          </div>
        )}

        {activePR.body && <div className="mb-4 whitespace-pre-wrap rounded-lg bg-[var(--surface-soft)] p-3 text-sm">{activePR.body}</div>}

        <section className="rounded-xl border border-[var(--line)]" aria-labelledby="pr-security-title" data-pr-security-review>
          <div className="border-b border-[var(--line)] p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-[var(--sage)]" />
              <h3 id="pr-security-title" className="text-sm font-semibold">Проверка изменений</h3>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">Просмотрите файлы и состояние GitHub перед одобрением или слиянием.</p>
          </div>

          <div className="grid grid-cols-3 gap-2 border-b border-[var(--line)] p-3 text-center">
            <div><b className="block text-sm tabular-nums">{formatCount(activePR.changed_files ?? files.length)}</b><span className="text-[11px] text-[var(--muted)]">файлов</span></div>
            <div><b className="block text-sm tabular-nums text-[#5D7659]">+{formatCount(activePR.additions)}</b><span className="text-[11px] text-[var(--muted)]">добавлено</span></div>
            <div><b className="block text-sm tabular-nums text-[#A16C62]">−{formatCount(activePR.deletions)}</b><span className="text-[11px] text-[var(--muted)]">удалено</span></div>
          </div>

          <div className="max-h-44 overflow-auto text-xs" data-pr-files>
            {filesLoading ? (
              <div className="flex items-center gap-2 p-3 text-[var(--muted)]"><LoaderCircle size={14} className="animate-spin" /> Загружаем список файлов…</div>
            ) : filesUnavailable ? (
              <div className="flex items-start gap-2 p-3 text-[var(--muted)]"><AlertTriangle size={15} className="mt-0.5 flex-none text-[#A16C62]" /><span>Список файлов недоступен. Откройте PR на GitHub для ручной проверки.</span></div>
            ) : files.length ? (
              files.map(file => (
                <div key={`${file.sha}:${file.filename}`} className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2 last:border-b-0">
                  <FileCode2 size={13} className="flex-none text-[var(--muted)]" />
                  <span className="min-w-0 flex-1 truncate font-mono" title={file.filename}>{file.filename}</span>
                  <span className="flex-none tabular-nums text-[#5D7659]">+{file.additions}</span>
                  <span className="flex-none tabular-nums text-[#A16C62]">−{file.deletions}</span>
                </div>
              ))
            ) : (
              <p className="p-3 text-[var(--muted)]">Изменённые файлы не найдены.</p>
            )}
          </div>

          <div className="border-t border-[var(--line)] p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted)]">Состояние слияния</span>
              <b className={mergeBlockedReason ? 'text-[#A16C62]' : getMergeState(activePR) === 'unstable' ? 'text-[#A16C62]' : 'text-[#5D7659]'}>{getMergeStateLabel(activePR)}</b>
            </div>
            {mergeBlockedReason && <p className="mt-2 leading-relaxed text-[#A16C62]" data-pr-merge-blocked>{mergeBlockedReason}</p>}
            {!mergeBlockedReason && getMergeState(activePR) === 'unstable' && <p className="mt-2 leading-relaxed text-[#A16C62]">Проверки GitHub не полностью зелёные. Перед слиянием проверьте их вручную.</p>}
          </div>
        </section>

        {canReview && (
          <div className="mt-4 grid gap-2" data-pr-actions>
            <button
              type="button"
              className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--line)] px-3 text-sm font-semibold hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setConfirmation('approve')}
              disabled={detailLoading || filesLoading || busyAction !== null}
              data-pr-approve
            >
              <ShieldCheck size={16} />
              {approvedInSession ? 'PR одобрен' : 'Подтвердить безопасность'}
            </button>
            <button
              type="button"
              className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-3 text-sm font-semibold text-[var(--on-ink)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setConfirmation('merge')}
              disabled={detailLoading || filesLoading || Boolean(mergeBlockedReason) || busyAction !== null}
              data-pr-merge
            >
              <GitMerge size={16} />
              Объединить с {activePR.base.ref}
            </button>
          </div>
        )}

        {(canClose || canReopen) && (
          <div className="mt-3 grid gap-2" data-pr-state-actions>
            {canClose ? (
              <button
                type="button"
                className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--line)] px-3 text-sm font-semibold text-[#A16C62] hover:bg-[var(--danger-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => setConfirmation('close')}
                disabled={detailLoading || filesLoading || busyAction !== null}
                data-pr-close
              >
                <XCircle size={16} />
                Закрыть PR
              </button>
            ) : (
              <button
                type="button"
                className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--line)] px-3 text-sm font-semibold hover:bg-[var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => setConfirmation('reopen')}
                disabled={detailLoading || filesLoading || busyAction !== null}
                data-pr-reopen
              >
                <RotateCcw size={16} />
                Переоткрыть PR
              </button>
            )}
          </div>
        )}

        <button type="button" className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--line)] text-sm font-semibold hover:bg-[var(--surface-soft)]" onClick={() => void openExternal(activePR.html_url)}>
          <ExternalLink size={16} />
          Открыть на {providerLabel}
        </button>
      </div>

      {confirmation && (
        <PullRequestConfirmDialog
          kind={confirmation}
          pr={activePR}
          files={files}
          busy={busyAction === confirmation}
          mergeBlockedReason={mergeBlockedReason}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void (
            confirmation === 'approve'
              ? handleApprove()
              : confirmation === 'merge'
                ? handleMerge()
                : handleStateChange(confirmation === 'close' ? 'closed' : 'open')
          )}
        />
      )}
    </div>
  );
};
