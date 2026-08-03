import React, { useState } from 'react';
import {
  BookOpen,
  Box,
  ChevronRight,
  CircleDot,
  Code2,
  Eye,
  EyeOff,
  GitBranch,
  GitCommitHorizontal,
  GitCompare,
  GitPullRequest,
  History,
  Link2,
  Menu,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useApp } from './context/AppContext';
import { Sidebar } from './components/Sidebar/Sidebar';
import { Graph } from './components/Graph/Graph';
import { DetailPanel } from './components/DetailPanel/DetailPanel';
import { PRList } from './components/PR/PRList';
import { PRDetail } from './components/PR/PRDetail';
import { IssueList } from './components/Issue/IssueList';
import { IssueDetail } from './components/Issue/IssueDetail';
import { SearchBar } from './components/Search/SearchBar';
import { CreateModal } from './components/Modal/CreateModal';
import { EditModal } from './components/Modal/EditModal';
import { BranchModal } from './components/Modal/BranchModal';
import { CreatePRModal } from './components/Modal/CreatePRModal';
import { CreateIssueModal } from './components/Modal/CreateIssueModal';
import { CreateReleaseModal } from './components/Modal/CreateReleaseModal';
import { ReadmeModal } from './components/Modal/ReadmeModal';
import { ChangesModal } from './components/Modal/ChangesModal';
import { SettingsModal } from './components/Modal/SettingsModal';
import { LoginModal } from './components/Modal/LoginModal';
import { UpdatesModal } from './components/Modal/UpdatesModal';
import { ConnectionErrorPanel } from './components/common/ConnectionErrorPanel';
import { MoreMenu } from './components/common/MoreMenu';
import { Toast } from './components/common/Toast';

export const App: React.FC = () => {
  const {
    project,
    mobileOpen,
    setMobileOpen,
    createOpen,
    editOpen,
    setEditOpen,
    branchOpen,
    setBranchOpen,
    prOpen,
    settingsOpen,
    issueOpen,
    releaseOpen,
    readmeOpen,
    changesOpen,
    loginOpen,
    toast,
    notify,
    loading,
    lastUpdatedAt,
    error,
    connectionError,
    user,
    connected,
    projects,
    branches,
    commits,
    setLoginOpen,
    setReleaseOpen,
    setReadmeOpen,
    setChangesOpen,
    openExternal,
    syncAllData,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'graph' | 'pr' | 'issues'>('graph');
  const [graphVisible, setGraphVisible] = useState(true);
  const [branchStartTab, setBranchStartTab] = useState<'list' | 'create'>('list');

  const copyRepositoryUrl = async () => {
    if (!project) return;
    await navigator.clipboard.writeText(`https://github.com/${project.repo}`);
    notify('Ссылка на репозиторий скопирована');
  };

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--ink)]">
      <Sidebar />

      {mobileOpen && (
        <button
          className="md:hidden fixed inset-0 bg-[rgba(38,23,50,.42)] z-10"
          aria-label="Закрыть меню"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <main className="md:ml-60 min-w-0 min-h-screen flex flex-col">
        <header className="h-[58px] border-b border-[rgba(38,23,50,.12)] flex items-center gap-2 px-3 sm:px-6 bg-[var(--header-bg)] text-[var(--ink)] backdrop-blur-[14px] sticky top-0 z-10">
          <button
            className="md:hidden w-8 h-8 flex-none grid place-items-center rounded-lg"
            aria-label="Открыть меню"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={21} />
          </button>

          <div className="min-w-0 flex items-center gap-1.5 text-xs">
            <span className="text-[#7D7482]">Проекты</span>
            {project && (
              <>
                <ChevronRight size={14} className="flex-none" />
                <b className="truncate">{project.name}</b>
              </>
            )}
          </div>

          <button
            className="ml-auto w-8 h-8 flex-none rounded-full overflow-hidden bg-[#261732] text-[#E7E0D6] text-xs font-extrabold grid place-items-center"
            aria-label={connected ? `GitHub: ${user?.login}` : 'Подключиться с PAT'}
            onClick={() => !connected && setLoginOpen(true)}
          >
            {user?.avatar_url
              ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
              : '??'}
          </button>
        </header>

        {!connected ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 rounded-2xl bg-[#261732] grid place-items-center mx-auto mb-6">
                <GitBranch size={40} className="text-[#E7E0D6]" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight mb-3">Gitora</h1>
              <p className="text-sm text-[#7D7482] leading-relaxed mb-6">
                Визуальный граф истории Git-репозиториев. Подключитесь с Personal Access Token, чтобы видеть коммиты, ветки и слияния в одном месте.
              </p>
              <button
                className="h-11 px-6 bg-[#261732] text-[#E7E0D6] rounded-lg text-sm font-semibold"
                onClick={() => setLoginOpen(true)}
              >
                Подключиться с PAT
              </button>
            </div>
          </div>
        ) : !project ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-[#E7E0D6] grid place-items-center mx-auto mb-4">
                <Box size={32} className="text-[#7D7482]" />
              </div>
              <h2 className="text-xl font-bold mb-2">Нет репозиториев</h2>
              {connectionError ? (
                <div className="text-left mt-5">
                  <ConnectionErrorPanel
                    error={connectionError}
                    onAction={() => {
                      if (['auth', 'session', 'permissions'].includes(connectionError.kind)) setLoginOpen(true);
                      else void syncAllData();
                    }}
                    onSecondaryAction={() => setLoginOpen(true)}
                    compact
                  />
                </div>
              ) : (
                <p className="text-sm text-[#7D7482]">
                  {projects.length
                    ? 'Выберите репозиторий в боковой панели.'
                    : 'Создайте новый репозиторий кнопкой в боковой панели.'}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <section className="px-4 sm:px-8 py-6 sm:py-8 flex flex-col lg:flex-row lg:justify-between lg:items-end gap-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-[#7D7482] font-semibold">
                  <span className="w-[23px] h-[23px] rounded-md bg-[#E7E0D6] grid place-items-center">
                    <Box size={14} />
                  </span>
                  <span className="truncate">{project.repo}</span>
                </div>
                <h1 className="text-[28px] sm:text-[32px] leading-none tracking-tight mt-3 mb-2 truncate text-balance">{project.name}</h1>
                <p className="text-xs text-[#7D7482]">История проекта и связи между ветками.</p>
              </div>
              <div className="flex w-full flex-wrap items-center justify-end gap-1.5 lg:w-auto" data-project-actions>
                <button
                  type="button"
                  className="min-h-10 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-sm font-semibold flex items-center gap-1.5 hover:bg-[var(--surface-soft)]"
                  onClick={() => setChangesOpen(true)}
                  aria-label="Открыть изменения проекта"
                  data-project-changes
                >
                  <GitCompare size={14} />
                  Изменения
                </button>
                <button
                  type="button"
                  className="min-h-10 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-sm font-semibold flex items-center gap-1.5 hover:bg-[var(--surface-soft)]"
                  onClick={() => setReleaseOpen(true)}
                  aria-label="Открыть релизы"
                  data-project-release
                >
                  <PackagePlus size={14} />
                  Релиз
                </button>
                <button
                  type="button"
                  className="min-h-10 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 text-sm font-semibold flex items-center gap-1.5 hover:bg-[var(--surface-soft)]"
                  onClick={() => setReadmeOpen(true)}
                  aria-label="Открыть README"
                  data-project-readme
                >
                  <BookOpen size={14} />
                  README
                </button>
                <MoreMenu
                  label="Дополнительные действия репозитория"
                  triggerTestId="data-project-more-trigger"
                  menuTestId="data-project-more-menu"
                  items={[
                    { id: 'sync', label: loading ? 'Синхронизация…' : 'Синхронизация', icon: RefreshCw, onSelect: () => void syncAllData(), disabled: loading },
                    { id: 'edit', label: 'Редактировать', icon: Pencil, onSelect: () => setEditOpen(true), dividerBefore: true },
                    { id: 'branches', label: 'Управление ветками', icon: GitBranch, onSelect: () => { setBranchStartTab('list'); setBranchOpen(true); } },
                    { id: 'copy-link', label: 'Копировать ссылку', icon: Link2, onSelect: () => void copyRepositoryUrl() },
                    { id: 'github', label: 'Открыть на GitHub', icon: Code2, onSelect: () => void openExternal(`https://github.com/${project.repo}`), external: true },
                  ]}
                />
              </div>
              {lastUpdatedAt && (
                <p className="text-xs text-[#7D7482] lg:text-right" aria-live="polite">
                  Обновлено в {new Date(lastUpdatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </section>

            <section className="mx-4 sm:mx-8 mb-5 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-0 p-4 bg-white rounded-xl border border-[rgba(38,23,50,.12)]">
              {[
                [<GitCommitHorizontal size={17} />, commits.length || '—', 'коммитов'],
                [<GitBranch size={17} />, branches.length || '—', 'веток'],
                [<History size={17} />, project.updated || '—', 'обновлено'],
              ].map(([icon, value, label], index) => (
                <div key={String(label)} className={`flex items-center gap-3 sm:px-4 ${index < 2 ? 'sm:border-r sm:border-[rgba(38,23,50,.12)]' : ''}`}>
                  <span className="text-[#7D7482]">{icon}</span>
                  <span>
                    <b className="block text-sm tabular-nums">{value}</b>
                    <small className="block text-xs text-[#7D7482]">{label}</small>
                  </span>
                </div>
              ))}
            </section>

            <section className="mx-4 sm:mx-8 mb-4">
              <SearchBar owner={project.repo.split('/')[0]} repo={project.repo.split('/')[1]} />
            </section>

            <section className="mx-4 sm:mx-8 mb-4 border border-[rgba(38,23,50,.12)] rounded-xl bg-white min-h-[500px] flex flex-col flex-1">
              <div className="min-h-[52px] border-b border-[rgba(38,23,50,.12)] rounded-t-xl flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2">
                <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                  <button
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === 'graph' ? 'bg-[#261732] text-[#E7E0D6]' : 'text-[#7D7482] hover:bg-[#F3EFE9]'}`}
                    onClick={() => setActiveTab('graph')}
                  >
                    <GitCommitHorizontal size={14} className="inline mr-1.5" />
                    Граф
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === 'pr' ? 'bg-[#261732] text-[#E7E0D6]' : 'text-[#7D7482] hover:bg-[#F3EFE9]'}`}
                    onClick={() => setActiveTab('pr')}
                  >
                    <GitPullRequest size={14} className="inline mr-1.5" />
                    Pull Requests
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${activeTab === 'issues' ? 'bg-[#261732] text-[#E7E0D6]' : 'text-[#7D7482] hover:bg-[#F3EFE9]'}`}
                    onClick={() => setActiveTab('issues')}
                  >
                    <CircleDot size={14} className="inline mr-1.5" />
                    Задачи
                  </button>
                </div>
                {activeTab === 'graph' && (
                  <MoreMenu
                    label="Дополнительные действия графа"
                    triggerTestId="data-graph-more-trigger"
                    menuTestId="data-graph-more-menu"
                    items={[{
                      id: graphVisible ? 'hide-graph' : 'show-graph',
                      label: graphVisible ? 'Скрыть граф' : 'Показать граф',
                      icon: graphVisible ? EyeOff : Eye,
                      onSelect: () => { setGraphVisible(!graphVisible); notify(graphVisible ? 'Граф скрыт. Данные репозитория сохранены.' : 'Граф показан'); },
                    }]}
                  />
                )}
              </div>
              <div className="flex min-h-[445px] flex-1 flex-col md:flex-row">
                {activeTab === 'graph' ? (
                  graphVisible ? (
                  <>
                    <div className="flex-1 min-w-0 min-h-0 overflow-auto">
                      <Graph />
                    </div>
                    <DetailPanel />
                  </>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface-soft)] text-[var(--muted)]">
                        <GitCommitHorizontal size={24} />
                      </span>
                      <div>
                        <h2 className="text-base font-semibold">Граф скрыт</h2>
                        <p className="mt-1 text-xs text-[var(--muted)]">Данные репозитория сохранены. Добавьте узел, чтобы продолжить просмотр истории.</p>
                      </div>
                      <button
                        type="button"
                        className="mt-1 flex min-h-[38px] items-center gap-2 rounded-lg bg-[var(--ink)] px-3 text-xs font-semibold text-[var(--on-ink)]"
                        onClick={() => { setGraphVisible(true); notify('Граф показан'); }}
                      >
                        <Plus size={15} />
                        Добавить узел
                      </button>
                    </div>
                  )
                ) : activeTab === 'pr' ? (
                  <>
                    <div className="flex-1 min-w-0 overflow-auto">
                      <PRList owner={project.repo.split('/')[0]} repo={project.repo.split('/')[1]} />
                    </div>
                    <PRDetail />
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0 overflow-auto">
                      <IssueList owner={project.repo.split('/')[0]} repo={project.repo.split('/')[1]} />
                    </div>
                    <IssueDetail />
                  </>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {loginOpen && <LoginModal />}
      {createOpen && <CreateModal />}
      {editOpen && project && (
        <EditModal
          repoFullName={project.repo}
          currentName={project.name}
          currentDescription={project.description}
          currentPrivate={project.isPrivate}
        />
      )}
      {branchOpen && project && (
        <BranchModal
          branches={branches}
          repoFullName={project.repo}
          defaultBranch={project.defaultBranch}
          initialTab={branchStartTab}
        />
      )}
      {prOpen && project && (
        <CreatePRModal
          branches={branches}
          repoFullName={project.repo}
        />
      )}
      {issueOpen && project && (
        <CreateIssueModal repoFullName={project.repo} />
      )}
      {releaseOpen && project && (
        <CreateReleaseModal
          branches={branches}
          repoFullName={project.repo}
          defaultBranch={project.defaultBranch}
        />
      )}
      {readmeOpen && project && (
        <ReadmeModal
          branches={branches}
          repoFullName={project.repo}
          defaultBranch={project.defaultBranch}
        />
      )}
      {changesOpen && project && (
        <ChangesModal
          branches={branches}
          repoFullName={project.repo}
          defaultBranch={project.defaultBranch}
        />
      )}
      {settingsOpen && <SettingsModal />}
      <UpdatesModal />
      <Toast message={toast} />

      {loading && (
        <div className="fixed inset-0 bg-[rgba(38,23,50,.3)] backdrop-blur-sm grid place-items-center z-50" role="status">
          <div className="bg-white rounded-xl p-6 shadow-lg flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#AEA989] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-semibold">Загрузка…</span>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-5 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 bg-[#A16C62] text-white px-4 py-3 rounded-lg shadow-lg z-[110] text-sm" role="alert">
          {error}
        </div>
      )}
    </div>
  );
};
