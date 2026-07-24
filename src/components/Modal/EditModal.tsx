import React, { useEffect, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface EditModalProps {
  repoFullName: string;
  currentName: string;
  currentDescription: string;
  currentPrivate: boolean;
}

export const EditModal: React.FC<EditModalProps> = ({
  repoFullName,
  currentName,
  currentDescription,
  currentPrivate,
}) => {
  const { setEditOpen, updateRepo, loading } = useApp();
  const [name, setName] = useState(currentName);
  const [description, setDescription] = useState(currentDescription);
  const [isPrivate, setIsPrivate] = useState(currentPrivate);
  const [closing, setClosing] = useState(false);

  const [owner, repo] = repoFullName.split('/');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading]);

  const close = () => {
    if (loading) return;
    setClosing(true);
    window.setTimeout(() => setEditOpen(false), 150);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const data: { name?: string; description?: string; private?: boolean } = {};
    
    if (name.trim() !== currentName) data.name = name.trim();
    if (description.trim() !== currentDescription) data.description = description.trim();
    if (isPrivate !== currentPrivate) data.private = isPrivate;

    if (Object.keys(data).length === 0) {
      close();
      return;
    }

    const success = await updateRepo(owner, repo, data);
    if (success) close();
  };

  return (
    <div
      className="modal-overlay fixed inset-0 backdrop-blur-sm grid place-items-center z-50 p-3 sm:p-5"
      data-closing={closing}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        className="modal-panel w-[min(440px,100%)] max-h-[calc(100vh-24px)] overflow-auto rounded-2xl p-6 sm:p-7 relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-title"
      >
        <button className="absolute right-4 top-4 w-8 h-8 grid place-items-center" aria-label="Закрыть" onClick={close}>
          <X size={19} />
        </button>
        <div className="w-[47px] h-[47px] rounded-[13px] bg-[#E7E0D6] grid place-items-center">
          <Pencil size={25} />
        </div>
        <h2 id="edit-title" className="text-[23px] font-semibold mt-4 mb-1">Редактировать репозиторий</h2>
        <p className="text-[11px] text-[#7D7482] leading-relaxed mb-5">
          Измените настройки репозитория <b className="text-[#261732]">{repoFullName}</b>
        </p>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-bold">
            Название
            <input
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="studio-website"
              className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
            />
          </label>

          <label className="block text-xs font-bold mt-4">
            Описание
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={350}
              rows={3}
              className="block w-full resize-none border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg p-3 text-sm mt-2"
            />
          </label>

          <fieldset className="mt-4">
            <legend className="text-xs font-bold">Видимость</legend>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {[true, false].map(value => (
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={isPrivate === value}
                  className={`h-[40px] border rounded-lg text-xs flex items-center justify-center gap-1.5 ${isPrivate === value ? 'bg-[#E7E0D6] border-[#AEA989]' : 'border-[rgba(38,23,50,.12)]'}`}
                  onClick={() => setIsPrivate(value)}
                >
                  {isPrivate === value && <Check size={15} />}
                  {value ? 'Приватный' : 'Публичный'}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
            <button type="button" className="px-4 py-2 border border-[rgba(38,23,50,.12)] rounded-lg text-sm font-semibold" onClick={close}>
              Отмена
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="px-4 py-2 bg-[#261732] text-[#E7E0D6] rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Pencil size={16} />
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
