import React, { useEffect, useState } from 'react';
import { PackagePlus, Paperclip, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Branch, ReleaseAssetSelection } from '../../types';
import { MarkdownEditor } from '../common/MarkdownEditor';

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

type ReleaseStatus = 'none' | 'prerelease' | 'latest';

const RELEASE_STATUS_OPTIONS: Array<{ value: ReleaseStatus; label: string; description: string }> = [
  { value: 'none', label: 'Нет', description: 'Не помечать релиз как предрелиз или последнюю версию.' },
  { value: 'prerelease', label: 'Предрелизная версия', description: 'Пометить релиз как не готовый к использованию в продакшене.' },
  { value: 'latest', label: 'Последняя версия', description: 'Пометить релиз как последнюю версию для этого репозитория.' },
];

export const CreateReleaseModal: React.FC<CreateReleaseModalProps> = ({ branches, repoFullName, defaultBranch }) => {
  const { setReleaseOpen, createRelease, selectReleaseAsset, loading } = useApp();
  const [owner, repo] = repoFullName.split('/');
  const [tagName, setTagName] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [targetCommitish, setTargetCommitish] = useState(defaultBranch || branches[0]?.name || 'main');
  const [draft, setDraft] = useState(true);
  const [releaseStatus, setReleaseStatus] = useState<ReleaseStatus>('none');
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
      prerelease: releaseStatus === 'prerelease',
      makeLatest: releaseStatus === 'latest' ? 'true' : 'false',
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
        <p className="text-xs text-[#7D7482] leading-relaxed mb-5">
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
            <MarkdownEditor
              value={body}
              onValueChange={setBody}
              rows={5}
              placeholder="Что изменилось в этом релизе..."
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

          <div className="mt-4">
            <label className={`min-h-[42px] border border-[rgba(38,23,50,.12)] rounded-lg px-3 flex items-center gap-2 text-xs font-bold ${releaseStatus === 'latest' ? 'opacity-55' : ''}`}>
              <input type="checkbox" checked={draft} disabled={releaseStatus === 'latest'} onChange={(event) => setDraft(event.target.checked)} data-release-draft />
              Черновик
            </label>
          </div>

          <fieldset className="mt-4">
            <legend className="text-xs font-bold">Статус релиза</legend>
            <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Статус релиза">
              {RELEASE_STATUS_OPTIONS.map(option => {
                const selected = releaseStatus === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-release-status={option.value}
                    className={`min-h-[52px] rounded-xl border px-3 py-2.5 text-left transition-colors ${selected ? 'border-[#AEA989] bg-[#F3EFE9] shadow-[0_0_0_3px_rgba(174,169,137,.18)]' : 'border-[rgba(38,23,50,.12)] hover:bg-[#F3EFE9]'}`}
                    onClick={() => {
                      setReleaseStatus(option.value);
                      if (option.value === 'latest') setDraft(false);
                    }}
                  >
                    <span className="block text-xs font-bold">{option.label}</span>
                    <span className="block mt-0.5 text-xs font-normal leading-relaxed text-[#7D7482]">{option.description}</span>
                  </button>
                );
              })}
            </div>
            {releaseStatus === 'latest' && <p className="mt-2 text-xs text-[#7D7482]">Последней версией может быть только опубликованный полный релиз.</p>}
          </fieldset>

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
