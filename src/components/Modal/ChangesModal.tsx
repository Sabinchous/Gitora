import React, { useEffect, useState } from 'react';
import { FolderOpen, GitCommitHorizontal, RefreshCw, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Branch, FolderChangesSummary, UploadFolderSummary } from '../../types';

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

export const ChangesModal: React.FC<ChangesModalProps> = ({ branches, repoFullName, defaultBranch }) => {
  const {
    setChangesOpen,
    selectUploadFolder,
    checkFolderChanges,
    commitFolderChanges,
    loading,
  } = useApp();
  const [owner, repo] = repoFullName.split('/');
  const [branch, setBranch] = useState(defaultBranch || branches[0]?.name || 'main');
  const [folder, setFolder] = useState<UploadFolderSummary | null>(null);
  const [summary, setSummary] = useState<FolderChangesSummary | null>(null);
  const [message, setMessage] = useState('Обновлены файлы проекта');

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) setChangesOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [loading, setChangesOpen]);

  const close = () => !loading && setChangesOpen(false);

  const pickFolder = async () => {
    const nextFolder = await selectUploadFolder();
    if (!nextFolder) return;
    setFolder(nextFolder);
    setSummary(await checkFolderChanges(owner, repo, branch, nextFolder.path));
  };

  const refresh = async () => {
    if (!folder) return;
    setSummary(await checkFolderChanges(owner, repo, branch, folder.path));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!folder || !summary) return;
    const result = await commitFolderChanges(owner, repo, branch, folder.path, message);
    if (result) setChangesOpen(false);
  };

  const changeCount = summary ? summary.added + summary.modified + summary.deleted : 0;

  return (
    <div
      className="fixed inset-0 bg-[rgba(38,23,50,.58)] backdrop-blur-sm grid place-items-center z-50 p-3 sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        className="w-[min(640px,100%)] max-h-[calc(100vh-24px)] overflow-auto bg-white rounded-2xl p-6 sm:p-7 relative shadow-[0_18px_50px_rgba(38,23,50,.13)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="changes-title"
      >
        <button className="absolute right-4 top-4 w-8 h-8 grid place-items-center" aria-label="Закрыть" onClick={close}>
          <X size={19} />
        </button>
        <div className="w-[47px] h-[47px] rounded-[13px] bg-[#E7E0D6] grid place-items-center">
          <GitCommitHorizontal size={25} />
        </div>
        <h2 id="changes-title" className="text-[23px] font-semibold mt-4 mb-1">Изменения</h2>
        <p className="text-[11px] text-[#7D7482] leading-relaxed mb-5">
          Сравнение локальной папки с <b className="text-[#261732]">{repoFullName}</b>
        </p>

        <form onSubmit={submit}>
          <label className="block text-xs font-bold">
            Ветка
            <input
              list="changes-branches"
              value={branch}
              onChange={(event) => {
                setBranch(event.target.value);
                setSummary(null);
              }}
              className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
            />
            <datalist id="changes-branches">
              {branches.map(item => <option key={item.name} value={item.name} />)}
            </datalist>
          </label>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={pickFolder}
              disabled={loading}
              className="flex-1 min-h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm flex items-center gap-2 text-left hover:bg-[#E7E0D6] disabled:opacity-40"
            >
              <FolderOpen size={16} className="flex-none text-[#7D7482]" />
              <span className="truncate text-[#7D7482]">{folder?.path || 'Выбрать папку проекта'}</span>
            </button>
            <button
              type="button"
              onClick={refresh}
              disabled={loading || !folder}
              className="w-[42px] flex-none border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg grid place-items-center hover:bg-[#E7E0D6] disabled:opacity-40"
              aria-label="Проверить заново"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {summary && (
            <div className="mt-4 border border-[rgba(38,23,50,.12)] rounded-lg overflow-hidden">
              <div className="grid grid-cols-3 bg-[#F3EFE9] text-center text-xs font-bold">
                <span className="p-3">+{summary.added}</span>
                <span className="p-3 border-x border-[rgba(38,23,50,.08)]">~{summary.modified}</span>
                <span className="p-3">-{summary.deleted}</span>
              </div>
              <div className="max-h-[210px] overflow-auto text-[11px]">
                {changeCount === 0 ? (
                  <p className="p-3 text-[#7D7482]">Изменений нет</p>
                ) : summary.changes.map(change => (
                  <div key={`${change.status}:${change.path}`} className="grid grid-cols-[82px_1fr] gap-2 px-3 py-2 border-t border-[rgba(38,23,50,.08)]">
                    <b>{STATUS_LABEL[change.status]}</b>
                    <span className="truncate font-mono text-[#7D7482]">{change.path}</span>
                  </div>
                ))}
              </div>
              {summary.warnings.length > 0 && (
                <p className="p-3 border-t border-[rgba(38,23,50,.08)] text-[10px] text-[#A16C62]">
                  {summary.warnings.slice(0, 3).join('; ')}
                </p>
              )}
            </div>
          )}

          <label className="block text-xs font-bold mt-4">
            Сообщение коммита
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
            />
          </label>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
            <button type="button" className="px-4 py-2 border border-[rgba(38,23,50,.12)] rounded-lg text-sm font-semibold" onClick={close}>
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || !folder || !summary || changeCount === 0 || !message.trim()}
              className="px-4 py-2 bg-[#261732] text-[#E7E0D6] rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <GitCommitHorizontal size={16} />
              Коммит и пуш
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
