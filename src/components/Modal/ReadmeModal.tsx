import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, LoaderCircle, Save, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Branch } from '../../types';

interface ReadmeModalProps {
  branches: Branch[];
  repoFullName: string;
  defaultBranch: string;
}

export const ReadmeModal: React.FC<ReadmeModalProps> = ({ branches, repoFullName, defaultBranch }) => {
  const { setReadmeOpen, getReadme, saveReadme, loading } = useApp();
  const [owner, repo] = repoFullName.split('/');
  const [branch, setBranch] = useState(defaultBranch || branches[0]?.name || 'main');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('Обновлён README');
  const [readmeLoading, setReadmeLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [readmeNotice, setReadmeNotice] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    setReadmeLoading(true);
    setReadmeNotice('');

    void getReadme(owner, repo, branch).then(nextContent => {
      if (currentRequest !== requestId.current) return;
      setContent(nextContent);
      setDirty(false);
    }).finally(() => {
      if (currentRequest === requestId.current) setReadmeLoading(false);
    });
  }, [owner, repo, branch]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading && !readmeLoading) setReadmeOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [loading, readmeLoading, setReadmeOpen]);

  const close = () => !loading && !readmeLoading && setReadmeOpen(false);

  const changeBranch = (nextBranch: string) => {
    if (nextBranch === branch) return;
    if (dirty) {
      setReadmeNotice('Сначала сохраните README или отмените изменения.');
      return;
    }
    setBranch(nextBranch);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (readmeLoading) return;
    const ok = await saveReadme(owner, repo, branch, content, message);
    if (ok) {
      setDirty(false);
      setReadmeOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-[rgba(38,23,50,.58)] backdrop-blur-sm grid place-items-center z-50 p-3 sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        className="w-[min(720px,100%)] max-h-[calc(100vh-24px)] overflow-auto bg-white rounded-2xl p-6 sm:p-7 relative shadow-[0_18px_50px_rgba(38,23,50,.13)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="readme-title"
      >
        <button className="absolute right-4 top-4 w-8 h-8 grid place-items-center" aria-label="Закрыть" onClick={close}>
          <X size={19} />
        </button>
        <div className="w-[47px] h-[47px] rounded-[13px] bg-[#E7E0D6] grid place-items-center">
          <BookOpen size={25} />
        </div>
        <h2 id="readme-title" className="text-[23px] font-semibold mt-4 mb-1">README</h2>
        <p className="text-[11px] text-[#7D7482] leading-relaxed mb-5">
          Файл <b className="text-[#261732]">README.md</b> в <b className="text-[#261732]">{repoFullName}</b>
        </p>

        <form onSubmit={submit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-bold">
              Ветка
              <input
                list="readme-branches"
                value={branch}
                onChange={(event) => changeBranch(event.target.value)}
                disabled={loading || readmeLoading}
                className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2 disabled:opacity-50"
              />
              <datalist id="readme-branches">
                {branches.map(item => <option key={item.name} value={item.name} />)}
              </datalist>
            </label>

            <label className="block text-xs font-bold">
              Сообщение коммита
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
              />
            </label>
          </div>

          <label className="block text-xs font-bold mt-4">
            Markdown
            <textarea
              autoFocus
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setDirty(true);
              }}
              disabled={loading || readmeLoading}
              rows={14}
              className="block w-full resize-y min-h-[260px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg p-3 text-sm mt-2 font-mono disabled:opacity-50"
              placeholder={`# ${repo}\n\nОписание проекта.`}
            />
          </label>

          {readmeLoading && (
            <p className="flex items-center gap-2 text-xs text-[#7D7482] mt-3" role="status">
              <LoaderCircle size={14} className="animate-spin" />
              Загружаем README…
            </p>
          )}
          {readmeNotice && (
            <p className="text-xs text-[#9A5B20] mt-3" role="alert">{readmeNotice}</p>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
            <button type="button" className="px-4 py-2 border border-[rgba(38,23,50,.12)] rounded-lg text-sm font-semibold" onClick={close}>
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || readmeLoading || !message.trim()}
              className="px-4 py-2 bg-[#261732] text-[#E7E0D6] rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Save size={16} />
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
