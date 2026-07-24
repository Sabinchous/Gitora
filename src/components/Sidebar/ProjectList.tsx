import React, { useState } from 'react';
import { FolderGit2, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Project } from '../../types';

export const ProjectList: React.FC = () => {
  const { projects, project, setProject, setMobileOpen, deleteRepo, loading } = useApp();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [closingDelete, setClosingDelete] = useState(false);

  const closeConfirm = () => {
    if (loading) return;
    setClosingDelete(true);
    window.setTimeout(() => {
      setConfirmDelete(null);
      setClosingDelete(false);
    }, 150);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const [owner, repo] = confirmDelete.repo.split('/');
    const success = await deleteRepo(owner, repo);
    if (success) {
      closeConfirm();
    }
  };

  return (
    <>
      <div className="flex-1 overflow-auto px-2">
        {projects.map((p) => (
          <div
            key={p.id}
            className="relative group"
            onMouseEnter={() => setHoveredId(p.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <button
              className={`flex items-center gap-2.5 w-full border-0 bg-transparent text-[rgba(231,224,214,.65)] p-2 rounded-lg text-left cursor-pointer relative hover:bg-[rgba(231,224,214,.08)] hover:text-[#E7E0D6] ${project?.id === p.id ? 'bg-[rgba(231,224,214,.08)] text-[#E7E0D6]' : ''}`}
              onClick={() => {
                setProject(p);
                setMobileOpen(false);
              }}
            >
              <span
                className="w-7 h-7 rounded-lg grid place-items-center"
                style={{
                  backgroundColor: `color-mix(in srgb, ${p.color}, transparent 78%)`,
                  color: p.color
                }}
              >
                <FolderGit2 size={17} />
              </span>
              <span className="flex-1 min-w-0">
                <b className="block text-[11px] truncate">{p.name}</b>
                <small className="block text-[8px] text-[rgba(231,224,214,.38)] mt-0.5 truncate">{p.repo}</small>
              </span>
              {project?.id === p.id && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#AEA989] shadow-[0_0_0_3px_rgba(174,169,137,.12)] mr-9" />
              )}
            </button>
            {(hoveredId === p.id || project?.id === p.id) && !loading && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded grid place-items-center text-[rgba(231,224,214,.65)] hover:text-[#A16C62] hover:bg-[rgba(161,108,98,.1)] opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(p);
                }}
                aria-label="Удалить репозиторий"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      {confirmDelete && (
        <div
          className="modal-overlay fixed inset-0 backdrop-blur-sm grid place-items-center z-50 p-3"
          data-closing={closingDelete}
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && closeConfirm()}
        >
          <div className="modal-panel w-[min(380px,100%)] rounded-2xl p-6">
            <div className="w-[47px] h-[47px] rounded-[13px] bg-[#FDE8E4] grid place-items-center mb-4">
              <Trash2 size={25} className="text-[#A16C62]" />
            </div>
            <h2 className="text-[23px] font-semibold mb-1">Удалить репозиторий?</h2>
            <p className="text-[11px] text-[#7D7482] leading-relaxed mb-2">
              Репозиторий <b className="text-[#261732]">{confirmDelete.name}</b> будет удалён навсегда.
            </p>
            <p className="text-[10px] text-[#A16C62] leading-relaxed mb-5">
              Это действие нельзя отменить. Все данные, включая коммиты, ветки и файлы, будут удалены.
            </p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                className="px-4 py-2 border border-[rgba(38,23,50,.12)] rounded-lg text-sm font-semibold"
                onClick={closeConfirm}
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
    </>
  );
};
