import React, { useEffect, useState } from 'react';
import { GitPullRequest, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Branch } from '../../types';

interface CreatePRModalProps {
  branches: Branch[];
  repoFullName: string;
}

export const CreatePRModal: React.FC<CreatePRModalProps> = ({ branches, repoFullName }) => {
  const { setPrOpen, createPullRequest, loading } = useApp();
  const [owner, repo] = repoFullName.split('/');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [head, setHead] = useState('');
  const [base, setBase] = useState('main');

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) setPrOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [loading, setPrOpen]);

  const close = () => !loading && setPrOpen(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !head) return;
    
    const success = await createPullRequest(owner, repo, title.trim(), body.trim(), head, base);
    if (success) {
      setTitle('');
      setBody('');
      setHead('');
      setPrOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-[rgba(38,23,50,.58)] backdrop-blur-sm grid place-items-center z-50 p-3 sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        className="w-[min(500px,100%)] max-h-[calc(100vh-24px)] overflow-auto bg-white rounded-2xl p-6 sm:p-7 relative shadow-[0_18px_50px_rgba(38,23,50,.13)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-pr-title"
      >
        <button className="absolute right-4 top-4 w-8 h-8 grid place-items-center" aria-label="Закрыть" onClick={close}>
          <X size={19} />
        </button>
        <div className="w-[47px] h-[47px] rounded-[13px] bg-[#E7E0D6] grid place-items-center">
          <GitPullRequest size={25} />
        </div>
        <h2 id="create-pr-title" className="text-[23px] font-semibold mt-4 mb-1">Новый Pull Request</h2>
        <p className="text-[11px] text-[#7D7482] leading-relaxed mb-5">
          Создайте pull request в <b className="text-[#261732]">{repoFullName}</b>
        </p>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-bold">
            Заголовок
            <input
              autoFocus
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Добавлена новая функция"
              className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
            />
          </label>

          <label className="block text-xs font-bold mt-4">
            Описание
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              placeholder="Опишите изменения..."
              className="block w-full resize-none border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg p-3 text-sm mt-2"
            />
          </label>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <label className="block text-xs font-bold">
              Из ветки
              <select
                value={head}
                onChange={(event) => setHead(event.target.value)}
                required
                className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
              >
                <option value="">Выберите ветку</option>
                {branches.map((branch) => (
                  <option key={branch.name} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-bold">
              В ветку
              <select
                value={base}
                onChange={(event) => setBase(event.target.value)}
                className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
              >
                {branches.map((branch) => (
                  <option key={branch.name} value={branch.name}>{branch.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
            <button type="button" className="px-4 py-2 border border-[rgba(38,23,50,.12)] rounded-lg text-sm font-semibold" onClick={close}>
              Отмена
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !head || loading}
              className="px-4 py-2 bg-[#261732] text-[#E7E0D6] rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <GitPullRequest size={16} />
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};