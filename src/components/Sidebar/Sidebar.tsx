import React from 'react';
import { ChevronDown, Download, GitBranch, Github, LogOut, Plus, Settings, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ProjectList } from './ProjectList';

export const Sidebar: React.FC = () => {
  const {
    mobileOpen,
    setMobileOpen,
    setCreateOpen,
    setLoginOpen,
    setSettingsOpen,
    setUpdatesOpen,
    user,
    connected,
    logout,
  } = useApp();

  const userName = user ? user.name || user.login : 'Не подключён';
  const userLogin = user ? `@${user.login}` : 'Нажмите для входа';

  return (
    <aside className={`fixed inset-y-0 left-0 w-60 bg-[#261732] text-[#E7E0D6] flex flex-col z-20 transform transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      <div className="h-[70px] flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 grid place-items-center rounded-lg bg-[#AEA989] text-[#261732] -rotate-6">
            <GitBranch size={18} />
          </div>
          <span className="text-xl font-extrabold tracking-tight">gitora</span>
        </div>
        <button
          className="md:hidden w-8 h-8 grid place-items-center rounded-lg text-inherit"
          aria-label="Закрыть меню"
          onClick={() => setMobileOpen(false)}
        >
          <X size={20} />
        </button>
      </div>

      <div className="px-3">
        <button
          className="border border-[rgba(231,224,214,.1)] bg-[rgba(255,255,255,.045)] rounded-xl w-full p-2.5 flex items-center gap-2.5 text-left text-inherit"
          onClick={() => !connected && setLoginOpen(true)}
        >
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-none" />
          ) : (
            <span className="w-8 h-8 rounded-full bg-[rgba(231,224,214,.1)] text-[rgba(231,224,214,.4)] grid place-items-center">
              <Github size={16} />
            </span>
          )}
          <span className="flex-1 min-w-0">
            <b className="block text-xs truncate">{userName}</b>
            <small className="block text-[9px] text-[rgba(231,224,214,.5)] mt-0.5 truncate">{userLogin}</small>
          </span>
          {!connected && <ChevronDown size={16} />}
        </button>
      </div>

      <div className="flex items-center justify-between text-[9px] font-extrabold tracking-[1.5px] text-[rgba(231,224,214,.45)] mt-5 px-4 pb-2">
        <span>ПРОЕКТЫ</span>
        {connected && (
          <button aria-label="Создать репозиторий" onClick={() => setCreateOpen(true)}>
            <Plus size={15} className="text-[#AEA989]" />
          </button>
        )}
      </div>

      <ProjectList />

      {connected && (
        <button
          className="mx-4 mt-4 mb-3 border border-dashed border-[rgba(231,224,214,.18)] rounded-lg h-10 flex items-center justify-center gap-2 text-[11px] text-[rgba(231,224,214,.72)] hover:text-[#E7E0D6] hover:bg-[rgba(231,224,214,.06)]"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={16} />
          Новый репозиторий
        </button>
      )}

      <div className="mt-auto p-3 border-t border-[rgba(231,224,214,.09)]">
        <button
          className="w-full flex items-center gap-2 text-left text-xs text-[rgba(231,224,214,.62)] py-2 hover:text-[#E7E0D6]"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={16} />
          Настройки
        </button>
        <button
          className="w-full flex items-center gap-2 text-left text-xs text-[rgba(231,224,214,.62)] py-2 hover:text-[#E7E0D6]"
          onClick={() => setUpdatesOpen(true)}
        >
          <Download size={16} />
          Обновления
        </button>
        {connected ? (
          <button
            className="w-full flex items-center gap-2 text-left text-xs text-[rgba(231,224,214,.62)] py-2 hover:text-[#E7E0D6]"
            onClick={() => void logout()}
          >
            <LogOut size={16} />
            Отключить GitHub
          </button>
        ) : (
          <button
            className="w-full flex items-center gap-2 text-left text-xs text-[rgba(231,224,214,.62)] py-2 hover:text-[#E7E0D6]"
            onClick={() => setLoginOpen(true)}
          >
            <Github size={16} />
            Подключить GitHub
          </button>
        )}
      </div>
    </aside>
  );
};
