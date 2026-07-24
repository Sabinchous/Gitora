import React, { useEffect, useState } from 'react';
import { PackagePlus, Paperclip, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Branch, ReleaseAssetSelection } from '../../types';

interface CreateReleaseModalProps {
  branches: Branch[];
  repoFullName: string;
  defaultBranch: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export const CreateReleaseModal: React.FC<CreateReleaseModalProps> = ({ branches, repoFullName, defaultBranch }) => {
  const { setReleaseOpen, createRelease, selectReleaseAsset, loading } = useApp();
  const [owner, repo] = repoFullName.split('/');
  const [tagName, setTagName] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [targetCommitish, setTargetCommitish] = useState(defaultBranch || branches[0]?.name || 'main');
  const [draft, setDraft] = useState(true);
  const [prerelease, setPrerelease] = useState(false);
  const [asset, setAsset] = useState<ReleaseAssetSelection | null>(null);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) setReleaseOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [loading, setReleaseOpen]);

  const close = () => !loading && setReleaseOpen(false);

  const pickAsset = async () => {
    const nextAsset = await selectReleaseAsset();
    if (nextAsset) setAsset(nextAsset);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tagName.trim()) return;

    const success = await createRelease(owner, repo, {
      tagName: tagName.trim(),
      targetCommitish,
      name: name.trim(),
      body: body.trim(),
      draft,
      prerelease,
      assetPath: asset?.path,
    });
    if (success) setReleaseOpen(false);
  };

  return (
    <div
      className="fixed inset-0 bg-[rgba(38,23,50,.58)] backdrop-blur-sm grid place-items-center z-50 p-3 sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        className="w-[min(520px,100%)] max-h-[calc(100vh-24px)] overflow-auto bg-white rounded-2xl p-6 sm:p-7 relative shadow-[0_18px_50px_rgba(38,23,50,.13)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-release-title"
      >
        <button className="absolute right-4 top-4 w-8 h-8 grid place-items-center" aria-label="Закрыть" onClick={close}>
          <X size={19} />
        </button>
        <div className="w-[47px] h-[47px] rounded-[13px] bg-[#E7E0D6] grid place-items-center">
          <PackagePlus size={25} />
        </div>
        <h2 id="create-release-title" className="text-[23px] font-semibold mt-4 mb-1">Новый релиз</h2>
        <p className="text-[11px] text-[#7D7482] leading-relaxed mb-5">
          Создайте GitHub Release в <b className="text-[#261732]">{repoFullName}</b>
        </p>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs font-bold">
              Тег
              <input
                autoFocus
                required
                value={tagName}
                onChange={(event) => setTagName(event.target.value)}
                placeholder="v1.0.0"
                className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
              />
            </label>

            <label className="block text-xs font-bold">
              Ветка или SHA
              <input
                list="release-branches"
                value={targetCommitish}
                onChange={(event) => setTargetCommitish(event.target.value)}
                className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
              />
              <datalist id="release-branches">
                {branches.map(branch => (
                  <option key={branch.name} value={branch.name} />
                ))}
              </datalist>
            </label>
          </div>

          <label className="block text-xs font-bold mt-4">
            Название
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Оставьте пустым, чтобы использовать тег"
              className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
            />
          </label>

          <label className="block text-xs font-bold mt-4">
            Описание
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              placeholder="Что изменилось в этом релизе..."
              className="block w-full resize-none border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg p-3 text-sm mt-2"
            />
          </label>

          <div className="mt-4">
            <button
              type="button"
              className="w-full min-h-[42px] border border-[rgba(38,23,50,.12)] rounded-lg px-3 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#F3EFE9]"
              onClick={() => void pickAsset()}
            >
              <Paperclip size={16} />
              {asset ? `${asset.name} (${formatSize(asset.size)})` : 'Прикрепить файл'}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="min-h-[42px] border border-[rgba(38,23,50,.12)] rounded-lg px-3 flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} />
              Черновик
            </label>
            <label className="min-h-[42px] border border-[rgba(38,23,50,.12)] rounded-lg px-3 flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={prerelease} onChange={(event) => setPrerelease(event.target.checked)} />
              Pre-release
            </label>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
            <button type="button" className="px-4 py-2 border border-[rgba(38,23,50,.12)] rounded-lg text-sm font-semibold" onClick={close}>
              Отмена
            </button>
            <button
              type="submit"
              disabled={!tagName.trim() || loading}
              className="px-4 py-2 bg-[#261732] text-[#E7E0D6] rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <PackagePlus size={16} />
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
