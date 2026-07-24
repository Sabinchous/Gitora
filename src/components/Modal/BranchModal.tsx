import React, { useEffect, useState } from 'react';
import { GitBranch, Plus, Pencil, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Branch } from '../../types';

interface BranchModalProps {
  branches: Branch[];
  repoFullName: string;
  defaultBranch: string;
}

export const BranchModal: React.FC<BranchModalProps> = ({ branches, repoFullName, defaultBranch }) => {
  const { setBranchOpen, createBranch, deleteBranch, renameBranch, loading } = useApp();
  const [owner, repo] = repoFullName.split('/');
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'rename'>('list');
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [renameBranchName, setRenameBranchName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Branch | null>(null);
  const [closing, setClosing] = useState(false);
  const [closingDelete, setClosingDelete] = useState(false);
  const baseBranch = branches.find(branch => branch.name === defaultBranch) ?? branches[0];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, setBranchOpen]);

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

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newBranchName.trim()) return;
    
    const fromSha = baseBranch?.tipSha || '';
    const success = await createBranch(owner, repo, newBranchName.trim(), fromSha);
    if (success) {
      setNewBranchName('');
      setActiveTab('list');
    }
  };

  const handleRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedBranch || !renameBranchName.trim()) return;
    
    const success = await renameBranch(owner, repo, selectedBranch.name, renameBranchName.trim());
    if (success) {
      setRenameBranchName('');
      setSelectedBranch(null);
      setActiveTab('list');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const success = await deleteBranch(owner, repo, confirmDelete.name);
    if (success) {
      setConfirmDelete(null);
    }
  };

  const startRename = (branch: Branch) => {
    setSelectedBranch(branch);
    setRenameBranchName(branch.name);
    setActiveTab('rename');
  };

  return (
    <div
      className="modal-overlay fixed inset-0 backdrop-blur-sm grid place-items-center z-50 p-3 sm:p-5"
      data-closing={closing}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        className="modal-panel w-[min(500px,100%)] max-h-[calc(100vh-24px)] overflow-auto rounded-2xl p-6 sm:p-7 relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="branch-title"
      >
        <button className="absolute right-4 top-4 w-8 h-8 grid place-items-center" aria-label="Закрыть" onClick={close}>
          <X size={19} />
        </button>
        <div className="w-[47px] h-[47px] rounded-[13px] bg-[#E7E0D6] grid place-items-center">
          <GitBranch size={25} />
        </div>
        <h2 id="branch-title" className="text-[23px] font-semibold mt-4 mb-1">Управление ветками</h2>
        <p className="text-[11px] text-[#7D7482] leading-relaxed mb-5">
          Создавайте, переименовывайте и удаляйте ветки в <b className="text-[#261732]">{repoFullName}</b>
        </p>

        <div className="flex gap-2 mb-4">
          <button
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === 'list' ? 'bg-[#261732] text-[#E7E0D6]' : 'border border-[rgba(38,23,50,.12)]'}`}
            onClick={() => setActiveTab('list')}
          >
            Ветки ({branches.length})
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === 'create' ? 'bg-[#261732] text-[#E7E0D6]' : 'border border-[rgba(38,23,50,.12)]'}`}
            onClick={() => setActiveTab('create')}
          >
            <Plus size={14} className="inline mr-1" />
            Создать
          </button>
        </div>

        {activeTab === 'list' && (
          <div className="max-h-[300px] overflow-auto">
            {branches.map((branch) => (
              <div
                key={branch.name}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#F3EFE9] group"
              >
                <div
                  className="w-3 h-3 rounded-full flex-none"
                  style={{ backgroundColor: branch.color }}
                />
                <span className="flex-1 text-sm font-medium truncate">{branch.name}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="w-7 h-7 rounded grid place-items-center text-[#7D7482] hover:text-[#261732] hover:bg-[rgba(38,23,50,.08)]"
                    onClick={() => startRename(branch)}
                    aria-label="Переименовать"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="w-7 h-7 rounded grid place-items-center text-[#7D7482] hover:text-[#A16C62] hover:bg-[rgba(161,108,98,.1)]"
                    onClick={() => setConfirmDelete(branch)}
                    aria-label="Удалить"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {branches.length === 0 && (
              <p className="text-center text-sm text-[#7D7482] py-8">Нет веток</p>
            )}
          </div>
        )}

        {activeTab === 'create' && (
          <form onSubmit={handleCreate}>
            <label className="block text-xs font-bold">
              Имя новой ветки
              <input
                autoFocus
                required
                value={newBranchName}
                onChange={(event) => setNewBranchName(event.target.value)}
                placeholder="feature/my-feature"
                className="focus-surface block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
              />
            </label>
            <p className="text-[10px] text-[#7D7482] mt-2">
              Ветка будет создана от <b>{baseBranch?.name || 'main'}</b>
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 border border-[rgba(38,23,50,.12)] rounded-lg text-sm font-semibold"
                onClick={() => setActiveTab('list')}
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={!newBranchName.trim() || loading}
                className="px-4 py-2 bg-[#261732] text-[#E7E0D6] rounded-lg text-sm font-semibold disabled:opacity-40"
              >
                Создать
              </button>
            </div>
          </form>
        )}

        {activeTab === 'rename' && selectedBranch && (
          <form onSubmit={handleRename}>
            <label className="block text-xs font-bold">
              Новое имя для <b className="text-[#261732]">{selectedBranch.name}</b>
              <input
                autoFocus
                required
                value={renameBranchName}
                onChange={(event) => setRenameBranchName(event.target.value)}
                className="focus-surface block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
              />
            </label>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 border border-[rgba(38,23,50,.12)] rounded-lg text-sm font-semibold"
                onClick={() => setActiveTab('list')}
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={!renameBranchName.trim() || renameBranchName === selectedBranch.name || loading}
                className="px-4 py-2 bg-[#261732] text-[#E7E0D6] rounded-lg text-sm font-semibold disabled:opacity-40"
              >
                Переименовать
              </button>
            </div>
          </form>
        )}
      </div>

      {confirmDelete && (
        <div
          className="modal-overlay fixed inset-0 backdrop-blur-sm grid place-items-center z-[60] p-3"
          data-closing={closingDelete}
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && closeDelete()}
        >
          <div className="modal-panel w-[min(380px,100%)] rounded-2xl p-6">
            <div className="w-[47px] h-[47px] rounded-[13px] bg-[#FDE8E4] grid place-items-center mb-4">
              <Trash2 size={25} className="text-[#A16C62]" />
            </div>
            <h2 className="text-[23px] font-semibold mb-1">Удалить ветку?</h2>
            <p className="text-[11px] text-[#7D7482] leading-relaxed mb-5">
              Ветка <b className="text-[#261732]">{confirmDelete.name}</b> будет удалена навсегда.
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 border border-[rgba(38,23,50,.12)] rounded-lg text-sm font-semibold"
                onClick={closeDelete}
              >
                Отмена
              </button>
              <button
                className="px-4 py-2 bg-[#A16C62] text-white rounded-lg text-sm font-semibold disabled:opacity-40"
                onClick={handleDelete}
                disabled={loading}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
