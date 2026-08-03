import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  FilePlus2,
  FileX2,
  FilePenLine,
  GitBranch,
  GitCommitHorizontal,
  Github,
  RotateCcw,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CommitFileChange } from '../../types';
import { getDiffLineKind } from '../../lib/commitDetails';
import { MoreMenu } from '../common/MoreMenu';

const FILE_STATUS: Record<string, { label: string; symbol: string; className: string }> = {
  added: { label: 'Добавлен', symbol: '+', className: 'text-[var(--diff-add-ink)] bg-[var(--diff-add-bg)]' },
  modified: { label: 'Изменён', symbol: '~', className: 'text-[var(--diff-modified-ink)] bg-[var(--diff-modified-bg)]' },
  deleted: { label: 'Удалён', symbol: '−', className: 'text-[var(--diff-del-ink)] bg-[var(--diff-del-bg)]' },
  renamed: { label: 'Переименован', symbol: '→', className: 'text-[var(--diff-renamed-ink)] bg-[var(--diff-renamed-bg)]' },
};

function statusForFile(file: CommitFileChange) {
  return FILE_STATUS[file.status] || FILE_STATUS.modified;
}

function DiffViewer({ file }: { file: CommitFileChange }) {
  const lines = file.patch?.split('\n') || [];

  if (!file.patch) {
    return (
      <p className="px-3 py-3 text-xs text-[var(--muted)] bg-[var(--surface-soft)]" data-diff-empty>
        Diff недоступен для этого файла — GitHub не возвращает содержимое для бинарных или слишком больших изменений.
      </p>
    );
  }

  return (
    <div className="border-t border-[var(--line)] bg-[var(--surface-soft)]" aria-label={`Diff файла ${file.filename}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--line)] text-xs font-medium text-[var(--diff-meta-ink)]">
        <span>До</span>
        <span className="font-mono truncate">unified diff</span>
        <span>После</span>
      </div>
      <pre className="max-h-[280px] overflow-auto p-3 text-xs leading-[1.6] font-mono whitespace-pre-wrap break-words text-[var(--diff-context-ink)]">
        {lines.map((line, index) => {
          const lineKind = getDiffLineKind(line);
          const isAddition = lineKind === 'addition';
          const isDeletion = lineKind === 'deletion';
          const className = isAddition ? 'diff-add-line' : isDeletion ? 'diff-del-line' : 'diff-context-line';
          return <span key={`${index}-${line}`} className={`block -mx-3 px-3 ${className}`}><span aria-hidden="true" className="inline-block w-4 select-none opacity-75">{isAddition ? '+' : isDeletion ? '−' : ' '}</span>{line}</span>;
        })}
      </pre>
    </div>
  );
}

function ChangedFile({ file, index }: { file: CommitFileChange; index: number }) {
  const status = statusForFile(file);
  const Icon = file.status === 'added' ? FilePlus2 : file.status === 'deleted' ? FileX2 : FilePenLine;
  return (
    <details open={index === 0} className="group border-b border-[var(--line)] last:border-b-0" data-changed-file>
      <summary className="list-none cursor-pointer px-3 py-2.5 flex items-center gap-2 min-h-[46px] hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)]">
        <span className={`w-5 h-5 rounded-md grid place-items-center text-xs font-black flex-none ${status.className}`} title={status.label}>
          <Icon size={13} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold truncate" title={file.filename}>{file.filename}</span>
          {file.previousFilename && <span className="block text-xs text-[var(--muted)] truncate">из {file.previousFilename}</span>}
        </span>
        <span className="flex-none text-xs font-mono tabular-nums whitespace-nowrap">
          <b className="text-[var(--diff-add-ink)]">+{file.additions}</b>{' '}<b className="text-[var(--diff-del-ink)]">−{file.deletions}</b>
        </span>
        <ChevronRight size={14} className="flex-none text-[var(--muted)] transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <div className="px-3 pb-2 text-xs text-[var(--muted)] flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 ${status.className}`}>{status.symbol} {status.label}</span>
        <span className="font-mono truncate" title={file.filename}>{file.filename}</span>
      </div>
      <DiffViewer file={file} />
    </details>
  );
}

export const DetailPanel: React.FC = () => {
  const {
    selectedCommit,
    setSelectedCommit,
    notify,
    project,
    commits,
    openExternal,
    downloadArchive,
    loadCommitDetail,
    commitStatsLoading,
  } = useApp();
  const [copiedHash, setCopiedHash] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedCommit(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [setSelectedCommit]);

  useEffect(() => {
    if (!selectedCommit || (selectedCommit.statsStatus !== 'idle' && selectedCommit.statsStatus !== undefined)) return;
    void loadCommitDetail(selectedCommit.id);
  }, [selectedCommit?.id, selectedCommit?.statsStatus, loadCommitDetail]);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const parents = useMemo(() => selectedCommit?.parents.map(sha => ({
    sha,
    commit: commits.find(item => item.id === sha),
  })) || [], [commits, selectedCommit?.parents]);

  if (!selectedCommit) return null;

  const fullMessage = selectedCommit.text || selectedCommit.label;
  const shortMessage = fullMessage.split('\n')[0];
  const files = selectedCommit.filesChanged || [];
  const totalChanges = selectedCommit.plus + selectedCommit.minus;

  const copyHash = async () => {
    try {
      if (window.electronAPI?.app.copyText) {
        const result = await window.electronAPI.app.copyText(selectedCommit.id);
        if (!result.success) throw new Error(result.error || 'copy unavailable');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(selectedCommit.id);
      } else {
        const input = document.createElement('textarea');
        input.value = selectedCommit.id;
        input.setAttribute('readonly', 'true');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('copy unavailable');
      }
      setCopiedHash(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopiedHash(false), 2200);
      notify('Полный SHA скопирован');
    } catch {
      notify('Не удалось скопировать SHA');
    }
  };

  const retryStats = () => {
    void loadCommitDetail(selectedCommit.id);
  };

  return (
    <aside
      className="w-full max-h-[52vh] md:sticky md:top-[66px] md:h-fit md:max-h-[calc(100vh-120px)] md:w-[344px] flex-none border border-x-0 border-b-0 md:border-y-0 md:border-l border-[var(--line)] bg-[var(--surface)] rounded-t-2xl md:rounded-none shadow-lg md:shadow-none overflow-auto md:self-start"
      aria-label="Детали коммита"
      data-detail-panel
    >
      <div className="sticky top-0 min-h-[48px] bg-[var(--surface)] border-b border-[var(--line)] flex items-center justify-between px-4 text-xs font-extrabold tracking-wider text-[var(--muted)] z-10">
        <span>ДЕТАЛИ КОММИТА</span>
        <div className="flex items-center gap-1">
          {project && (
            <MoreMenu
              label="Действия выбранного коммита"
              triggerTestId="data-commit-more-trigger"
              menuTestId="data-commit-more-menu"
              items={[
                { id: 'copy-sha', label: 'Копировать SHA', icon: Copy, onSelect: () => void copyHash() },
                { id: 'download', label: 'Скачать эту версию', icon: Download, onSelect: () => { const [owner, repo] = project.repo.split('/'); void downloadArchive(owner, repo, selectedCommit.id); } },
                { id: 'github', label: 'Открыть на GitHub', icon: Github, onSelect: () => void openExternal(`https://github.com/${project.repo}/commit/${selectedCommit.id}`), external: true },
              ]}
            />
          )}
          <button className="grid h-10 w-10 place-items-center rounded-lg hover:bg-[var(--surface-soft)]" aria-label="Закрыть детали" title="Закрыть детали (Esc)" onClick={() => setSelectedCommit(null)}>
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 text-xs font-extrabold tracking-wider text-[var(--muted)]">
          <span className="w-[27px] h-[27px] rounded-lg bg-[var(--surface-strong)] grid place-items-center text-[var(--ink)]">
            <GitCommitHorizontal size={16} />
          </span>
          КОММИТ
          {selectedCommit.merge && <span className="ml-auto rounded-full bg-[var(--surface-soft)] px-2 py-1 text-xs tracking-normal">MERGE</span>}
        </div>

        <details open className="group/section mt-3" data-detail-section="message">
          <summary className="flex cursor-pointer list-none items-start gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)]">
            <ChevronRight size={16} className="mt-1 flex-none text-[var(--muted)] transition-transform group-open/section:rotate-90" aria-hidden="true" />
            <h2 className="text-lg font-semibold tracking-tight leading-tight break-words">{shortMessage}</h2>
          </summary>
          {fullMessage !== shortMessage && (
            <p className="ml-6 mt-2 text-xs text-[var(--muted)] leading-relaxed whitespace-pre-line break-words">{fullMessage}</p>
          )}
        </details>

        <div className="flex items-center gap-2.5 mt-3">
          <span className="w-[30px] h-[30px] rounded-full bg-[var(--surface-strong)] text-xs font-extrabold grid place-items-center flex-none">
            {selectedCommit.author[0]?.toUpperCase() || '?'}
          </span>
          <div className="min-w-0">
            <b className="block text-xs truncate">{selectedCommit.author}</b>
            <small className="block text-xs text-[var(--muted)] mt-0.5">{selectedCommit.time}</small>
          </div>
        </div>

        <details className="mt-4 group/section border-b border-[var(--line)]" data-detail-section="identity">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-xs font-extrabold tracking-wider text-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)]">
            <ChevronRight size={14} className="transition-transform group-open/section:rotate-90" aria-hidden="true" />
            ВЕТКА И SHA
          </summary>
          <div className="pb-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[var(--surface-soft)] rounded-lg p-2 min-w-0">
                <small className="text-xs tracking-wider text-[var(--muted)] block mb-1.5">ВЕТКА</small>
                <b className="text-xs flex items-center gap-1"><GitBranch size={14} /><span className="truncate">{selectedCommit.branch}</span></b>
              </div>
              <div className="bg-[var(--surface-soft)] rounded-lg p-2 min-w-0">
                <small className="text-xs tracking-wider text-[var(--muted)] block mb-1.5">SHA</small>
                <button className="w-full text-left text-xs flex items-center gap-1 min-h-[30px]" onClick={() => void copyHash()} data-copy-sha title="Скопировать полный SHA">
                  <code className="font-mono truncate">{selectedCommit.hash}</code>
                  {copiedHash ? <Check size={13} className="text-[#5D7659] flex-none" /> : <Copy size={13} className="flex-none" />}
                </button>
              </div>
            </div>
            <div className="mt-2 p-2.5 rounded-lg bg-[var(--surface-soft)]">
              <div className="flex items-center justify-between gap-2 mb-1">
                <small className="text-xs tracking-wider text-[var(--muted)]">ПОЛНЫЙ SHA</small>
                {copiedHash && <span className="text-xs text-[#5D7659]" aria-live="polite">Скопировано</span>}
              </div>
              <button className="w-full text-left font-mono text-xs break-all leading-relaxed" onClick={() => void copyHash()}>{selectedCommit.id}</button>
            </div>
          </div>
        </details>

        <details className="group/section border-b border-[var(--line)]" data-detail-section="stats">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-xs font-extrabold tracking-wider text-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)]">
            <ChevronRight size={14} className="transition-transform group-open/section:rotate-90" aria-hidden="true" />
            СТАТИСТИКА ИЗМЕНЕНИЙ
            <span className="ml-auto font-normal tracking-normal">{selectedCommit.statsStatus === 'loading' ? 'загрузка…' : `${selectedCommit.files || 0} файлов`}</span>
          </summary>
          <div className="pb-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[var(--surface-soft)] rounded-lg p-2 min-w-0"><small className="text-xs tracking-wider text-[var(--muted)] block mb-1.5">ФАЙЛЫ</small><b className="text-xs tabular-nums">{selectedCommit.statsStatus === 'loading' ? '…' : selectedCommit.files || '—'}</b></div>
              <div className="bg-[var(--surface-soft)] rounded-lg p-2 min-w-0"><small className="text-xs tracking-wider text-[var(--muted)] block mb-1.5">ДОБАВЛЕНО</small><b className="text-xs tabular-nums text-[#5D7659]">+{selectedCommit.plus || 0}</b></div>
              <div className="bg-[var(--surface-soft)] rounded-lg p-2 min-w-0"><small className="text-xs tracking-wider text-[var(--muted)] block mb-1.5">УДАЛЕНО</small><b className="text-xs tabular-nums text-[#A16C62]">−{selectedCommit.minus || 0}</b></div>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">Общий объём изменений: <b className="tabular-nums text-[var(--ink)]">{totalChanges}</b> строк</p>
            {commitStatsLoading && selectedCommit.statsStatus === 'loading' && <p className="mt-2 text-xs text-[var(--muted)]" aria-live="polite">Загружаю файлы и diff…</p>}
            {selectedCommit.statsStatus === 'error' && (
              <div className="mt-2 p-2 rounded-lg bg-[var(--danger-soft)] text-xs text-[#A16C62] flex items-center gap-2" role="status">
                <span className="flex-1">Не удалось загрузить файлы и статистику.</span>
                <button type="button" className="min-h-[30px] px-2 rounded-md border border-current flex items-center gap-1" onClick={retryStats}><RotateCcw size={12} /> Повторить</button>
              </div>
            )}
          </div>
        </details>

        {selectedCommit.merge && <div className="mt-3 p-2 bg-[rgba(174,169,137,.12)] rounded-lg flex items-center gap-2"><span className="w-[6px] h-[6px] rounded-full bg-[#8E7CA3]" /><span className="text-xs text-[var(--muted)]">Слияние веток</span></div>}

        {parents.length > 0 && (
          <details className="group/section border-b border-[var(--line)]" data-detail-section="parents">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-xs font-extrabold tracking-wider text-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)]">
              <ChevronRight size={14} className="transition-transform group-open/section:rotate-90" aria-hidden="true" />
              РОДИТЕЛЬСКИЙ COMMIT
              <span className="ml-auto font-normal tracking-normal">{parents.length}</span>
            </summary>
            <div className="space-y-1.5">
              {parents.map(parent => (
                <button
                  type="button"
                  key={parent.sha}
                  className="w-full min-h-[38px] px-2.5 rounded-lg border border-[var(--line)] text-left flex items-center gap-2 hover:bg-[var(--surface-soft)] disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => parent.commit && setSelectedCommit(parent.commit)}
                  disabled={!parent.commit}
                  title={parent.commit ? 'Открыть родительский commit' : 'Родитель не загружен в текущей истории'}
                  data-parent-sha={parent.sha}
                >
                  <GitBranch size={13} className="text-[var(--muted)] flex-none" />
                  <span className="min-w-0 flex-1"><b className="block text-xs truncate">{parent.commit?.label || 'Родитель вне загруженной истории'}</b><code className="block text-xs text-[var(--muted)] font-mono truncate">{parent.sha}</code></span>
                  {parent.commit && <ChevronRight size={14} className="flex-none text-[var(--muted)]" />}
                </button>
              ))}
            </div>
          </details>
        )}

        <details className="group/section border-b border-[var(--line)]" data-detail-section="files">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-xs font-extrabold tracking-wider text-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)]">
            <ChevronRight size={14} className="transition-transform group-open/section:rotate-90" aria-hidden="true" />
            ИЗМЕНЁННЫЕ ФАЙЛЫ
            {files.length > 0 && <span className="ml-auto font-normal tracking-normal tabular-nums">{files.length}</span>}
          </summary>
          <div className="border border-[var(--line)] rounded-lg overflow-hidden">
            {selectedCommit.statsStatus === 'loading' ? <p className="px-3 py-3 text-xs text-[var(--muted)]">Готовлю список файлов…</p>
              : files.length > 0 ? files.map((file, index) => <ChangedFile key={`${file.filename}-${index}`} file={file} index={index} />)
                : <p className="px-3 py-3 text-xs text-[var(--muted)]">Файлы не изменялись или список недоступен.</p>}
          </div>
        </details>

      </div>
    </aside>
  );
};
