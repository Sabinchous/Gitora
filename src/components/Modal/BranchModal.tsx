import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Check,
  Code2,
  Copy,
  GitBranch,
  Palette,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Branch, BranchDirection } from '../../types';
import {
  BRANCH_COLOR_OPTIONS,
  defaultBranchColor,
  BranchVisualSettings,
} from '../../lib/branchPreferences';
import { MoreMenu } from '../common/MoreMenu';

interface BranchModalProps {
  branches: Branch[];
  repoFullName: string;
  defaultBranch: string;
  initialTab?: 'list' | 'create';
}

const directionOptions: Array<{ value: BranchDirection; label: string; Icon: typeof ArrowLeft }> = [
  { value: 'left', label: 'Расположить ветку слева', Icon: ArrowLeft },
  { value: 'auto', label: 'Автоматическое размещение', Icon: ArrowLeftRight },
  { value: 'right', label: 'Расположить ветку справа', Icon: ArrowRight },
];

function branchUrl(repoFullName: string, branchName: string): string {
  const path = branchName.split('/').map(part => encodeURIComponent(part)).join('/');
  return `https://github.com/${repoFullName}/tree/${path}`;
}

export const BranchModal: React.FC<BranchModalProps> = ({ branches, repoFullName, defaultBranch, initialTab = 'list' }) => {
  const {
    setBranchOpen,
    createBranch,
    deleteBranch,
    renameBranch,
    updateBranchVisualSettings,
    branchFilter,
    setBranchFilter,
    openExternal,
    notify,
    loading,
  } = useApp();
  const [owner, repo] = repoFullName.split('/');
  const [activeTab, setActiveTab] = useState<'list' | 'create'>(initialTab);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchColor, setBranchColor] = useState(defaultBranchColor('', 1));
  const [branchDirection, setBranchDirection] = useState<BranchDirection>('auto');
  const [quickBranchName, setQuickBranchName] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Branch | null>(null);
  const [closing, setClosing] = useState(false);
  const [closingDelete, setClosingDelete] = useState(false);
  const baseBranch = branches.find(branch => branch.name === defaultBranch) ?? branches[0];
  const activeBranchName = branchFilter === 'all' ? defaultBranch : branchFilter;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (quickBranchName) {
          setQuickBranchName(null);
          return;
        }
        if (!loading) close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, quickBranchName]);

  const close = () => {
    if (loading || closing) return;
    setClosing(true);
    window.setTimeout(() => setBranchOpen(false), 150);
  };

  const closeDelete = () => {
    if (loading || closingDelete) return;
    setClosingDelete(true);
    window.setTimeout(() => {
      setConfirmDelete(null);
      setClosingDelete(false);
    }, 150);
  };

  const openCreate = () => {
    setEditingBranch(null);
    setBranchName('');
    setBranchColor(defaultBranchColor('', branches.length));
    setBranchDirection('auto');
    setActiveTab('create');
  };

  const openEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setBranchName(branch.name);
    setBranchColor(branch.color);
    setBranchDirection(branch.direction);
    setQuickBranchName(null);
    setActiveTab('create');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextName = branchName.trim();
    if (!nextName) return;

    if (editingBranch) {
      if (nextName !== editingBranch.name) {
        const renamed = await renameBranch(owner, repo, editingBranch.name, nextName);
        if (!renamed) return;
      }
      updateBranchVisualSettings(nextName, { color: branchColor, direction: branchDirection });
      notify('Визуальные настройки ветки сохранены');
    } else {
      const created = await createBranch(owner, repo, nextName, baseBranch?.tipSha || '');
      if (!created) return;
      updateBranchVisualSettings(nextName, { color: branchColor, direction: branchDirection });
    }

    setEditingBranch(null);
    setBranchName('');
    setActiveTab('list');
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const success = await deleteBranch(owner, repo, confirmDelete.name);
    if (success) setConfirmDelete(null);
  };

  const chooseBranch = (branchName: string) => {
    setBranchFilter(branchName);
    setQuickBranchName(null);
    notify(`Граф переключён на ветку «${branchName}»`);
  };

  const copyBranchName = async (branchNameToCopy: string) => {
    try {
      await navigator.clipboard.writeText(branchNameToCopy);
      notify('Название ветки скопировано');
    } catch {
      notify('Не удалось скопировать название ветки');
    }
  };

  const updateQuickSettings = (branch: Branch, changes: Partial<BranchVisualSettings>) => {
    updateBranchVisualSettings(branch.name, changes);
    setQuickBranchName(null);
  };

  return (
    <div
      className="modal-overlay fixed inset-0 grid place-items-center z-50 p-3 sm:p-5"
      data-closing={closing}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        className="modal-panel w-[min(520px,100%)] max-h-[calc(100vh-24px)] overflow-auto rounded-2xl p-5 sm:p-6 relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-title"
      >
        <button className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)]" aria-label="Закрыть" onClick={close}>
          <X size={19} />
        </button>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--surface-strong)] text-[var(--ink)]">
          <GitBranch size={23} />
        </div>
        <h2 id="branch-title" className="mt-4 mb-1 text-[22px] font-semibold text-[var(--ink)]">
          {activeTab === 'create' ? (editingBranch ? 'Настроить ветку' : 'Новая ветка') : 'Управление ветками'}
        </h2>
        <p className="mb-5 text-xs leading-relaxed text-[var(--muted)]">
          {activeTab === 'create'
            ? 'Цвет и сторона влияют только на отображение ветки в графе.'
            : <>Настройте отображение веток в <b className="text-[var(--ink)]">{repoFullName}</b></>}
        </p>

        {activeTab === 'list' ? (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[var(--muted)]">Ветки ({branches.length})</span>
              <button
                type="button"
                className="flex min-h-10 items-center gap-2 rounded-lg bg-[var(--ink)] px-3 text-xs font-semibold text-[var(--on-ink)] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)]"
                onClick={openCreate}
              >
                <Plus size={15} aria-hidden="true" />
                Создать
              </button>
            </div>
            <div className="max-h-[340px] overflow-auto rounded-xl border border-[var(--line)] p-1" role="list" aria-label="Ветки репозитория">
              {branches.map((branch) => {
                const isActive = branch.name === activeBranchName;
                const isQuickOpen = quickBranchName === branch.name;
                return (
                  <div key={branch.name} className="relative flex min-h-12 items-center gap-2 rounded-lg px-2 hover:bg-[var(--surface-soft)]" data-branch-row={branch.name} role="listitem">
                    <button
                      type="button"
                      className="grid h-10 w-10 flex-none place-items-center rounded-lg hover:bg-[var(--surface-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)]"
                      aria-label={`Настроить цвет ветки ${branch.name}`}
                      title="Быстрый выбор цвета и стороны"
                      onClick={() => setQuickBranchName(isQuickOpen ? null : branch.name)}
                    >
                      <span className="h-3.5 w-3.5 rounded-full ring-2 ring-[var(--surface)]" style={{ backgroundColor: branch.color }} />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink)]">{branch.name}</span>
                    {isActive && <span className="rounded-full bg-[var(--surface-strong)] px-2 py-1 text-xs font-semibold text-[var(--muted)]">активна</span>}
                    <MoreMenu
                      label={`Действия ветки ${branch.name}`}
                      items={[
                        { id: 'checkout', label: 'Переключиться на ветку', icon: GitBranch, onSelect: () => chooseBranch(branch.name) },
                        { id: 'rename', label: 'Переименовать', icon: Pencil, onSelect: () => openEdit(branch) },
                        { id: 'visual', label: 'Настроить цвет и сторону', icon: Palette, onSelect: () => openEdit(branch) },
                        { id: 'github', label: 'Открыть на GitHub', icon: Code2, external: true, onSelect: () => openExternal(branchUrl(repoFullName, branch.name)) },
                        { id: 'copy', label: 'Скопировать название', icon: Copy, onSelect: () => copyBranchName(branch.name) },
                        { id: 'delete', label: 'Удалить', icon: Trash2, danger: true, dividerBefore: true, disabled: branch.name === defaultBranch, onSelect: () => setConfirmDelete(branch) },
                      ]}
                    />
                    {isQuickOpen && (
                      <div className="absolute right-2 top-12 z-20 w-[220px] rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow)]" role="dialog" aria-label={`Быстрые настройки ветки ${branch.name}`} onMouseDown={event => event.stopPropagation()}>
                        <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
                          <span>Цвет и сторона</span>
                          <button type="button" className="grid h-7 w-7 place-items-center rounded-md hover:bg-[var(--surface-soft)]" aria-label="Закрыть быстрые настройки" onClick={() => setQuickBranchName(null)}><X size={13} /></button>
                        </div>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Цвет ветки">
                          {BRANCH_COLOR_OPTIONS.map(option => (
                            <button
                              key={option.value}
                              type="button"
                              className={`grid h-8 w-8 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)] ${branch.color === option.value ? 'scale-110 ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--surface)]' : ''}`}
                              style={{ backgroundColor: option.value }}
                              aria-label={`Цвет ветки: ${option.label}`}
                              title={option.label}
                              onClick={() => updateQuickSettings(branch, { color: option.value })}
                            >
                              {branch.color === option.value && <Check size={14} className="text-white" aria-hidden="true" />}
                            </button>
                          ))}
                        </div>
                        <div className="mt-3 flex gap-1" role="group" aria-label="Сторона ветки">
                          {directionOptions.map(option => {
                            const Icon = option.Icon;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                className={`grid h-9 flex-1 place-items-center rounded-lg border text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)] ${branch.direction === option.value ? 'border-[var(--ink)] bg-[var(--surface-strong)]' : 'border-[var(--line)] hover:bg-[var(--surface-soft)]'}`}
                                aria-label={option.label}
                                title={option.label}
                                onClick={() => updateQuickSettings(branch, { direction: option.value })}
                              >
                                <Icon size={15} aria-hidden="true" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {branches.length === 0 && <p className="py-8 text-center text-sm text-[var(--muted)]">Нет веток</p>}
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="block text-xs font-semibold text-[var(--ink)]" htmlFor="branch-title-input">
              Имя ветки
              <input
                id="branch-title-input"
                autoFocus
                required
                value={branchName}
                onChange={event => setBranchName(event.target.value)}
                placeholder="feature/my-feature"
                className="focus-surface mt-2 block h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--ink)]"
              />
            </label>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              {editingBranch ? 'Изменения применятся только к графу и имени ветки.' : <>Ветка будет создана от <b className="text-[var(--ink)]">{baseBranch?.name || 'main'}</b></>}
            </p>

            <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Цвет</div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Цвет ветки">
                {BRANCH_COLOR_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={`grid h-9 w-9 place-items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)] ${branchColor === option.value ? 'scale-110 ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--surface-soft)]' : ''}`}
                    style={{ backgroundColor: option.value }}
                    aria-label={`Цвет ветки: ${option.label}`}
                    title={option.label}
                    onClick={() => setBranchColor(option.value)}
                  >
                    {branchColor === option.value && <Check size={15} className="text-white" aria-hidden="true" />}
                  </button>
                ))}
              </div>
              <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Сторона графа</div>
              <div className="flex gap-2" role="group" aria-label="Сторона ветки">
                {directionOptions.map(option => {
                  const Icon = option.Icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`grid h-10 flex-1 place-items-center rounded-lg border text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)] ${branchDirection === option.value ? 'border-[var(--ink)] bg-[var(--surface-strong)]' : 'border-[var(--line)] hover:bg-[var(--surface)]'}`}
                      aria-label={option.label}
                      title={option.label}
                      onClick={() => setBranchDirection(option.value)}
                    >
                      <Icon size={17} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
                <span className="h-3.5 w-3.5 flex-none rounded-full" style={{ backgroundColor: branchColor }} />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--ink)]">{branchName.trim() || 'feature/my-feature'}</span>
                {branchDirection === 'left' && <ArrowLeft size={14} className="text-[var(--muted)]" aria-hidden="true" />}
                {branchDirection === 'auto' && <ArrowLeftRight size={14} className="text-[var(--muted)]" aria-hidden="true" />}
                {branchDirection === 'right' && <ArrowRight size={14} className="text-[var(--muted)]" aria-hidden="true" />}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="min-h-10 rounded-lg border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)]" onClick={() => { setEditingBranch(null); setActiveTab('list'); }}>
                Отмена
              </button>
              <button type="submit" disabled={!branchName.trim() || loading} className="min-h-10 rounded-lg bg-[var(--ink)] px-4 text-sm font-semibold text-[var(--on-ink)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)]">
                {editingBranch ? 'Сохранить' : 'Создать ветку'}
              </button>
            </div>
          </form>
        )}
      </div>

      {confirmDelete && (
        <div className="modal-overlay fixed inset-0 grid place-items-center z-[60] p-3" data-closing={closingDelete} role="presentation" onMouseDown={event => event.target === event.currentTarget && closeDelete()}>
          <div className="modal-panel w-[min(380px,100%)] rounded-2xl p-6" role="dialog" aria-modal="true" aria-labelledby="delete-branch-title">
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--danger-soft)] text-[#A16C62]"><Trash2 size={23} /></div>
            <h2 id="delete-branch-title" className="mb-1 text-xl font-semibold text-[var(--ink)]">Удалить ветку?</h2>
            <p className="mb-5 text-xs leading-relaxed text-[var(--muted)]">Ветка <b className="text-[var(--ink)]">{confirmDelete.name}</b> будет удалена на GitHub. Это действие нельзя отменить.</p>
            <div className="flex justify-end gap-2">
              <button className="min-h-10 rounded-lg border border-[var(--line)] px-4 text-sm font-semibold text-[var(--ink)]" onClick={closeDelete}>Отмена</button>
              <button className="min-h-10 rounded-lg bg-[#A16C62] px-4 text-sm font-semibold text-white disabled:opacity-40" onClick={handleDelete} disabled={loading}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
