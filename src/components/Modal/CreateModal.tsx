import React, { useEffect, useState } from 'react';
import { Check, FolderGit2, FolderOpen, Github, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CreateRepositoryOptions, UploadFolderSummary } from '../../types';
import { MarkdownEditor } from '../common/MarkdownEditor';
import { SelectMenu } from '../common/SelectMenu';

const GITIGNORE_OPTIONS = [
  { value: '', label: 'Нет .gitignore' },
  { value: 'Node', label: 'Node' },
  { value: 'Python', label: 'Python' },
  { value: 'React', label: 'React' },
  { value: 'VisualStudioCode', label: 'Visual Studio Code' },
  { value: 'Go', label: 'Go' },
  { value: 'Java', label: 'Java' },
  { value: 'Rust', label: 'Rust' },
  { value: 'Swift', label: 'Swift' },
];

const LICENSE_OPTIONS = [
  { value: '', label: 'Нет лицензии' },
  { value: 'mit', label: 'MIT' },
  { value: 'apache-2.0', label: 'Apache 2.0' },
  { value: 'gpl-3.0', label: 'GPL-3.0' },
  { value: 'mpl-2.0', label: 'MPL-2.0' },
  { value: 'unlicense', label: 'Unlicense' },
];

export const CreateModal: React.FC = () => {
  const { setCreateOpen, createRepo, loading, selectUploadFolder, clearUploadFolder } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [autoInit, setAutoInit] = useState(true);
  const [gitignoreTemplate, setGitignoreTemplate] = useState('');
  const [licenseTemplate, setLicenseTemplate] = useState('');
  const [folderSummary, setFolderSummary] = useState<UploadFolderSummary | null>(null);

  const handleSelectFolder = async () => {
    const summary = await selectUploadFolder();
    if (summary) setFolderSummary(summary);
  };

  const handleClearFolder = async () => {
    await clearUploadFolder();
    setFolderSummary(null);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
  };

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) setCreateOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [loading, setCreateOpen]);

  const close = () => !loading && setCreateOpen(false);

  return (
    <div
      className="fixed inset-0 bg-[rgba(38,23,50,.58)] backdrop-blur-sm grid place-items-center z-50 p-3 sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        className="w-[min(440px,100%)] max-h-[calc(100vh-24px)] overflow-auto bg-white rounded-2xl p-6 sm:p-7 relative shadow-[0_18px_50px_rgba(38,23,50,.13)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
      >
        <button className="absolute right-4 top-4 w-8 h-8 grid place-items-center" aria-label="Закрыть" onClick={close}>
          <X size={19} />
        </button>
        <div className="w-[47px] h-[47px] rounded-[13px] bg-[#E7E0D6] grid place-items-center">
          <FolderGit2 size={25} />
        </div>
        <h2 id="create-title" className="text-[23px] font-semibold mt-4 mb-1">Новый репозиторий</h2>
        <p className="text-xs text-[#7D7482] leading-relaxed mb-5">Репозиторий будет создан в вашем аккаунте GitHub.</p>

        <form onSubmit={async (event) => {
          event.preventDefault();
          const options: CreateRepositoryOptions = {
            autoInit,
            ...(gitignoreTemplate ? { gitignoreTemplate } : {}),
            ...(licenseTemplate ? { licenseTemplate } : {}),
          };
          const result = await createRepo(name.trim(), description.trim(), isPrivate, folderSummary?.path, options);
          if (result) setCreateOpen(false);
        }}>
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
            <MarkdownEditor
              value={description}
              onValueChange={setDescription}
              maxLength={350}
              rows={3}
              placeholder="Коротко опишите проект…"
            />
          </label>

          <div className="mt-4">
            <span className="text-xs font-bold">Папка проекта</span>
            <span className="text-xs text-[#7D7482] ml-1">(необязательно)</span>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={handleSelectFolder}
                disabled={loading}
                className="flex-1 h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm flex items-center gap-2 text-left truncate hover:bg-[#E7E0D6] disabled:opacity-40"
              >
                <FolderOpen size={16} className="flex-none text-[#7D7482]" />
                <span className="truncate text-[#7D7482]">
                  {folderSummary ? folderSummary.path : 'Выбрать папку…'}
                </span>
              </button>
              {folderSummary && (
                <button
                  type="button"
                  onClick={handleClearFolder}
                  disabled={loading}
                  className="w-[42px] flex-none border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg grid place-items-center hover:bg-[#E7E0D6] disabled:opacity-40"
                  aria-label="Очистить папку"
                >
                  <Trash2 size={16} className="text-[#7D7482]" />
                </button>
              )}
            </div>
            {folderSummary && (
              <div className="mt-2 p-2 bg-[#F3EFE9] rounded-lg text-xs text-[#7D7482]">
                <div className="flex justify-between">
                  <span>Файлов: <b className="text-[#261732]">{folderSummary.fileCount}</b></span>
                  <span>Размер: <b className="text-[#261732]">{formatBytes(folderSummary.totalBytes)}</b></span>
                </div>
                {folderSummary.warnings.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-[rgba(38,23,50,.08)]">
                    {folderSummary.warnings.slice(0, 3).map((w, i) => (
                      <div key={i} className="text-[#A16C62]">{w}</div>
                    ))}
                    {folderSummary.warnings.length > 3 && (
                      <div className="text-[#7D7482]">и ещё {folderSummary.warnings.length - 3}…</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

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

          <fieldset className="mt-5">
            <legend className="text-xs font-bold">Конфигурация</legend>
            <div className="mt-2 overflow-hidden rounded-xl border border-[rgba(38,23,50,.12)] bg-[#F3EFE9]">
              <div className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold">Добавить README</div>
                  <p className="mt-1 text-xs leading-relaxed text-[#7D7482]">Создать первый commit с файлом README.md.</p>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <span className="text-xs text-[#7D7482]">{autoInit ? 'Вкл.' : 'Выкл.'}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoInit}
                    aria-label="Добавить README"
                    data-create-readme
                    onClick={() => setAutoInit(current => !current)}
                    className={`relative h-6 w-11 flex-none rounded-full border transition-colors ${autoInit ? 'border-[#AEA989] bg-[#AEA989]' : 'border-[rgba(38,23,50,.2)] bg-white'}`}
                  >
                    <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${autoInit ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="border-t border-[rgba(38,23,50,.1)] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-bold">Добавить .gitignore</div>
                    <p className="mt-1 text-xs leading-relaxed text-[#7D7482]">Файлы, которые Git не будет отслеживать.</p>
                  </div>
                  <div className="w-full flex-none sm:w-44">
                    <SelectMenu
                      value={gitignoreTemplate}
                      options={GITIGNORE_OPTIONS}
                      onChange={setGitignoreTemplate}
                      ariaLabel="Шаблон .gitignore"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-[rgba(38,23,50,.1)] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-bold">Добавить лицензию</div>
                    <p className="mt-1 text-xs leading-relaxed text-[#7D7482]">Условия использования и распространения кода.</p>
                  </div>
                  <div className="w-full flex-none sm:w-44">
                    <SelectMenu
                      value={licenseTemplate}
                      options={LICENSE_OPTIONS}
                      onChange={setLicenseTemplate}
                      ariaLabel="Шаблон лицензии"
                    />
                  </div>
                </div>
              </div>
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
              <Github size={16} />
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
