import React, { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, Github, Key, Link2, Shield, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ConnectionErrorPanel } from '../common/ConnectionErrorPanel';
import type { GitProviderKind } from '../../types';

export const LoginModal: React.FC = () => {
  const {
    setLoginOpen,
    login,
    loading,
    openExternal,
    connectionError,
    clearConnectionError,
  } = useApp();
  const [provider, setProvider] = useState<GitProviderKind>('github');
  const [token, setToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [closing, setClosing] = useState(false);

  const close = () => {
    if (loading || closing) return;
    setClosing(true);
    window.setTimeout(() => setLoginOpen(false), 150);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading]);

  const canSubmit = provider === 'github'
    ? token.trim().length > 0
    : token.trim().length > 0 && baseUrl.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    if (provider === 'gitea') {
      void login({ provider: 'gitea', token: token.trim(), baseUrl: baseUrl.trim() });
    } else {
      void login({ provider: 'github', token: token.trim() });
    }
  };

  const switchProvider = (next: GitProviderKind) => {
    if (loading) return;
    clearConnectionError();
    setProvider(next);
  };

  return (
    <div
      className="modal-overlay fixed inset-0 backdrop-blur-sm grid place-items-center z-[90] p-3 sm:p-5"
      data-closing={closing}
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        className="modal-panel w-[min(480px,100%)] max-h-[calc(100vh-24px)] overflow-auto rounded-2xl p-6 sm:p-8 relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
      >
        <button
          className="absolute right-4 top-4 w-8 h-8 grid place-items-center text-[#7D7482]"
          aria-label="Закрыть"
          disabled={loading}
          onClick={close}
        >
          <X size={19} />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-[#261732] grid place-items-center mb-6">
          <Github size={28} className="text-[#E7E0D6]" />
        </div>
        <h2 id="login-title" className="text-2xl font-bold tracking-tight mb-2">
          {provider === 'gitea' ? 'Подключение к Gitea' : 'Подключение к GitHub'}
        </h2>
        <p className="text-sm text-[#7D7482] leading-relaxed mb-4">
          {provider === 'gitea'
            ? 'Укажите адрес своего Gitea-сервера и токен доступа, чтобы работать с репозиториями, коммитами и ветками.'
            : 'Вставьте Personal Access Token, чтобы получить доступ к репозиториям, коммитам и веткам.'}
        </p>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#F3EFE9] mb-5" role="tablist" aria-label="Выбор провайдера">
          {(['github', 'gitea'] as GitProviderKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={provider === kind}
              disabled={loading}
              onClick={() => switchProvider(kind)}
              className={`h-9 rounded-lg text-sm font-semibold transition-colors ${
                provider === kind ? 'bg-[#261732] text-[#E7E0D6]' : 'text-[#7D7482]'
              }`}
            >
              {kind === 'github' ? 'GitHub' : 'Gitea'}
            </button>
          ))}
        </div>

        {connectionError && (
          <div className="mb-5">
            <ConnectionErrorPanel
              error={connectionError}
              compact
              onAction={() => {
                clearConnectionError();
                document.getElementById(provider === 'gitea' ? 'gitea-token' : 'github-token')?.focus();
              }}
            />
          </div>
        )}

        <form onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}>
          {provider === 'gitea' && (
            <label className="block text-xs font-bold mb-4">
              <span className="flex items-center gap-2 mb-2">
                <Link2 size={14} />
                Адрес Gitea-сервера
              </span>
              <input
                id="gitea-url"
                type="url"
                autoComplete="off"
                spellCheck={false}
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://gitea.example.com"
                className="focus-surface block w-full h-11 border border-[rgba(38,23,50,.15)] bg-[#F3EFE9] rounded-lg px-4 text-sm font-mono"
              />
            </label>
          )}

          <label className="block text-xs font-bold mb-2">
            <span className="flex items-center gap-2 mb-2">
              <Key size={14} />
              {provider === 'gitea' ? 'Токен доступа Gitea' : 'Personal Access Token'}
            </span>
            <input
              id={provider === 'gitea' ? 'gitea-token' : 'github-token'}
              autoFocus={provider === 'github'}
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={provider === 'gitea' ? 'Вставьте токен из настроек пользователя' : 'github_pat_…'}
              className="focus-surface block w-full h-11 border border-[rgba(38,23,50,.15)] bg-[#F3EFE9] rounded-lg px-4 text-sm font-mono"
            />
          </label>

          <div className="mt-4 p-3 bg-[rgba(174,169,137,.12)] rounded-lg flex gap-3 items-start">
            <Shield size={16} className="text-[#AEA989] flex-none mt-0.5" />
            <div className="text-xs text-[#7D7482] leading-relaxed">
              <p>Токен шифруется системным хранилищем Windows и не доступен интерфейсу после входа.</p>
              {provider === 'gitea' ? (
                <p className="mt-1">
                  Создайте токен в профиле Gitea: <span className="font-semibold">Настройки → Приложения → Создать токен</span> с
                  правами на репозитории, задачи и pull request’ы.
                </p>
              ) : (
                <button
                  type="button"
                  className="mt-1 text-[#261732] font-semibold underline"
                  onClick={() => void openExternal('https://github.com/settings/tokens')}
                >
                  Как создать Personal Access Token?
                  <ExternalLink size={10} className="inline ml-1" />
                </button>
              )}
            </div>
          </div>

          {provider === 'github' && (
            <p className="mt-3 text-xs leading-relaxed text-[#7D7482]">
              Fine-grained PAT: <code className="bg-[#F3EFE9] px-1.5 py-0.5 rounded text-xs">Metadata: read</code>, <code className="bg-[#F3EFE9] px-1.5 py-0.5 rounded text-xs">Contents: read/write</code>, <code className="bg-[#F3EFE9] px-1.5 py-0.5 rounded text-xs">Issues: read/write</code>, <code className="bg-[#F3EFE9] px-1.5 py-0.5 rounded text-xs">Pull requests: read/write</code>. Classic PAT: <code className="bg-[#F3EFE9] px-1.5 py-0.5 rounded text-xs">repo</code> + <code className="bg-[#F3EFE9] px-1.5 py-0.5 rounded text-xs">read:user</code>.
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-3 mt-6">
            <button
              type="button"
              className="flex-1 h-11 border border-[rgba(38,23,50,.15)] rounded-lg text-sm font-semibold"
              disabled={loading}
              onClick={close}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="flex-1 h-11 bg-[#261732] text-[#E7E0D6] rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {loading ? 'Проверка…' : <>Подключиться <ArrowRight size={16} /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
