import React, { useEffect, useState } from 'react';
import { CircleDot, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface CreateIssueModalProps {
  repoFullName: string;
}

export const CreateIssueModal: React.FC<CreateIssueModalProps> = ({ repoFullName }) => {
  const { setIssueOpen, createIssue, loading } = useApp();
  const [owner, repo] = repoFullName.split('/');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [labels, setLabels] = useState('');

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) setIssueOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [loading, setIssueOpen]);

  const close = () => !loading && setIssueOpen(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    
    const labelArray = labels.split(',').map(l => l.trim()).filter(l => l);
    const success = await createIssue(owner, repo, title.trim(), body.trim(), labelArray.length > 0 ? labelArray : undefined);
    if (success) {
      setTitle('');
      setBody('');
      setLabels('');
      setIssueOpen(false);
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
        aria-labelledby="create-issue-title"
      >
        <button className="absolute right-4 top-4 w-8 h-8 grid place-items-center" aria-label="Закрыть" onClick={close}>
          <X size={19} />
        </button>
        <div className="w-[47px] h-[47px] rounded-[13px] bg-[#E7E0D6] grid place-items-center">
          <CircleDot size={25} />
        </div>
        <h2 id="create-issue-title" className="text-[23px] font-semibold mt-4 mb-1">Новая задача</h2>
        <p className="text-[11px] text-[#7D7482] leading-relaxed mb-5">
          Создайте задачу в <b className="text-[#261732]">{repoFullName}</b>
        </p>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-bold">
            Заголовок
            <input
              autoFocus
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Исправить баг в авторизации"
              className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
            />
          </label>

          <label className="block text-xs font-bold mt-4">
            Описание
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              placeholder="Опишите задачу подробнее..."
              className="block w-full resize-none border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg p-3 text-sm mt-2"
            />
          </label>

          <label className="block text-xs font-bold mt-4">
            Метки
            <span className="text-[10px] text-[#7D7482] ml-1">(через запятую)</span>
            <input
              value={labels}
              onChange={(event) => setLabels(event.target.value)}
              placeholder="bug, enhancement"
              className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
            />
          </label>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
            <button type="button" className="px-4 py-2 border border-[rgba(38,23,50,.12)] rounded-lg text-sm font-semibold" onClick={close}>
              Отмена
            </button>
            <button
              type="submit"
              disabled={!title.trim() || loading}
              className="px-4 py-2 bg-[#261732] text-[#E7E0D6] rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <CircleDot size={16} />
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};