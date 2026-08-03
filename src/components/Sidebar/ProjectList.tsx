import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Copy,
  ExternalLink,
  Globe2,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Project } from '../../types';
import {
  filterAndSortProjects,
  ProjectSortMode,
  readProjectListPreferences,
  saveProjectListPreferences,
} from '../../lib/projectList';
import { SelectMenu } from '../common/SelectMenu';

const SORT_OPTIONS: { value: ProjectSortMode; label: string }[] = [
  { value: 'updated', label: 'Недавно обновлённые' },
  { value: 'name', label: 'По названию A→Z' },
  { value: 'favorites', label: 'Избранные сверху' },
  { value: 'private', label: 'Только приватные' },
  { value: 'public', label: 'Только публичные' },
];

interface MenuPosition {
  top: number;
  left: number;
}

export const ProjectList: React.FC = () => {
  const {
    projects,
    project,
    setProject,
    setMobileOpen,
    deleteRepo,
    loading,
    setEditOpen,
    openExternal,
    notify,
  } = useApp();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [preferences, setPreferences] = useState(readProjectListPreferences);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [closingDelete, setClosingDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);

  const closeMenu = () => {
    setOpenMenuId(null);
    setMenuPosition(null);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 150);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    saveProjectListPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    if (!openMenuId) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (menuRef.current?.contains(target) || target.closest('[data-project-menu-trigger]')) return;
      closeMenu();
    };
    const handleViewportChange = () => closeMenu();

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handleOutsidePointer);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handleOutsidePointer);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (openMenuId) firstMenuItemRef.current?.focus();
  }, [openMenuId]);

  const visibleProjects = useMemo(
    () => filterAndSortProjects(
      projects,
      debouncedQuery,
      preferences.sortMode,
      preferences.favoriteIds,
    ),
    [projects, debouncedQuery, preferences.sortMode, preferences.favoriteIds],
  );

  const openMenuProject = openMenuId ? projects.find(item => item.id === openMenuId) ?? null : null;

  const setSortMode = (sortMode: ProjectSortMode) => {
    setPreferences(current => ({ ...current, sortMode }));
    closeMenu();
  };

  const toggleFavorite = (projectId: string) => {
    setPreferences(current => ({
      ...current,
      favoriteIds: current.favoriteIds.includes(projectId)
        ? current.favoriteIds.filter(id => id !== projectId)
        : [...current.favoriteIds, projectId],
    }));
  };

  const selectProject = (nextProject: Project) => {
    setProject(nextProject);
    setMobileOpen(false);
    closeMenu();
  };

  const openProjectMenu = (event: React.MouseEvent<HTMLButtonElement>, nextProject: Project) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 198;
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    const top = rect.bottom + menuHeight + 8 > window.innerHeight
      ? Math.max(8, rect.top - menuHeight - 8)
      : rect.bottom + 8;

    setMenuPosition({ top, left });
    setOpenMenuId(nextProject.id);
  };

  const closeConfirm = () => {
    if (loading) return;
    setClosingDelete(true);
    window.setTimeout(() => {
      setConfirmDelete(null);
      setClosingDelete(false);
    }, 150);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const [owner, repo] = confirmDelete.repo.split('/');
    if (!owner || !repo) return;
    const success = await deleteRepo(owner, repo);
    if (success) closeConfirm();
  };

  const handleCopyLink = async (nextProject: Project) => {
    closeMenu();
    try {
      await navigator.clipboard.writeText(`https://github.com/${nextProject.repo}`);
      notify('Ссылка на репозиторий скопирована');
    } catch {
      notify('Не удалось скопировать ссылку');
    }
  };

  const handleOpenGithub = (nextProject: Project) => {
    closeMenu();
    void openExternal(`https://github.com/${nextProject.repo}`);
  };

  const resetList = () => {
    setQuery('');
    setSortMode('updated');
  };

  const emptyMessage = query.trim()
    ? 'Ничего не найдено'
    : preferences.sortMode === 'private'
      ? 'Нет приватных репозиториев'
      : preferences.sortMode === 'public'
        ? 'Нет публичных репозиториев'
        : 'Репозитории не найдены';

  return (
    <>
      <div className="flex-none px-2 pb-2 space-y-1.5">
        <label className="relative block">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[rgba(231,224,214,.42)]" aria-hidden="true" />
          <span className="sr-only">Поиск репозиториев</span>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Поиск репозиториев"
            className="h-8 w-full rounded-lg border border-[rgba(231,224,214,.11)] bg-[rgba(231,224,214,.06)] pl-8 pr-8 text-sm text-[#E7E0D6] placeholder:text-[rgba(231,224,214,.38)] outline-none focus:border-[rgba(174,169,137,.72)] focus:bg-[rgba(231,224,214,.1)]"
          />
          {query && (
            <button
              type="button"
              className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-[rgba(231,224,214,.5)] hover:bg-[rgba(231,224,214,.1)] hover:text-[#E7E0D6]"
              onClick={() => setQuery('')}
              aria-label="Очистить поиск"
            >
              <X size={13} />
            </button>
          )}
        </label>

        <label className="relative block">
          <SlidersHorizontal size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[rgba(231,224,214,.42)]" aria-hidden="true" />
          <span className="sr-only">Сортировка репозиториев</span>
          <SelectMenu
            value={preferences.sortMode}
            onChange={value => setSortMode(value as ProjectSortMode)}
            options={SORT_OPTIONS}
            ariaLabel="Сортировка репозиториев"
            variant="sidebar"
          />
        </label>
      </div>

      <div className="flex-1 overflow-auto px-2" onScroll={closeMenu}>
        {loading && projects.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-[rgba(231,224,214,.45)]">Загрузка репозиториев…</p>
        ) : visibleProjects.length > 0 ? (
          visibleProjects.map((item) => {
            const VisibilityIcon = item.isPrivate ? LockKeyhole : Globe2;
            const isFavorite = preferences.favoriteIds.includes(item.id);
            const isSelected = project?.id === item.id;

            return (
              <div
                key={item.id}
                className="relative group"
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <button
                  data-project-row={item.id}
                  className={`flex items-center gap-2.5 w-full border-0 bg-transparent text-[rgba(231,224,214,.65)] p-2 pr-11 rounded-lg text-left cursor-pointer relative hover:bg-[rgba(231,224,214,.08)] hover:text-[#E7E0D6] focus-visible:bg-[rgba(231,224,214,.08)] ${isSelected ? 'bg-[rgba(231,224,214,.1)] text-[#E7E0D6]' : ''}`}
                  onClick={() => selectProject(item)}
                >
                  <span
                    className="w-7 h-7 rounded-lg grid place-items-center flex-none"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${item.color}, transparent 78%)`,
                      color: item.color,
                    }}
                    title={item.isPrivate ? 'Приватный репозиторий' : 'Публичный репозиторий'}
                  >
                    <VisibilityIcon size={16} aria-hidden="true" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <b className="block text-sm truncate">{item.name}</b>
                    <small className="block text-xs text-[rgba(231,224,214,.38)] mt-0.5 truncate">{item.repo}</small>
                  </span>
                  <span className="flex flex-none items-center gap-1.5">
                    {isFavorite && <Star size={13} className="text-[#AEA989]" fill="currentColor" aria-label="Избранный репозиторий" />}
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#AEA989] shadow-[0_0_0_3px_rgba(174,169,137,.12)]" />}
                  </span>
                </button>

                {(hoveredId === item.id || isSelected) && (
                  <button
                    type="button"
                    data-project-menu-trigger
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-lg text-[rgba(231,224,214,.62)] opacity-0 transition-opacity hover:bg-[rgba(231,224,214,.12)] hover:text-[#E7E0D6] group-hover:opacity-100 group-focus-within:opacity-100"
                    onClick={event => openProjectMenu(event, item)}
                    aria-label={`Действия для ${item.name}`}
                    aria-haspopup="menu"
                    aria-expanded={openMenuId === item.id}
                    title="Действия репозитория"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div className="px-3 py-6 text-center">
            <p className="text-xs font-semibold text-[rgba(231,224,214,.74)]">{emptyMessage}</p>
            <p className="mt-1 text-xs leading-relaxed text-[rgba(231,224,214,.4)]">
              {query.trim() ? 'Попробуйте изменить запрос или очистить поиск.' : 'Измените фильтр, чтобы увидеть другие проекты.'}
            </p>
            {(query.trim() || preferences.sortMode === 'private' || preferences.sortMode === 'public') && (
              <button
                type="button"
                className="mt-3 rounded-md px-2 py-1 text-sm font-semibold text-[#AEA989] hover:bg-[rgba(174,169,137,.12)]"
                onClick={resetList}
              >
                Сбросить фильтр
              </button>
            )}
          </div>
        )}
      </div>

      {openMenuProject && menuPosition && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Действия для ${openMenuProject.name}`}
          className="fixed z-[100] w-48 overflow-hidden rounded-xl border border-[rgba(231,224,214,.12)] bg-[#261732] p-1.5 text-[#E7E0D6] shadow-[0_16px_40px_rgba(10,4,17,.35)]"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <button
            ref={firstMenuItemRef}
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[rgba(231,224,214,.82)] hover:bg-[rgba(231,224,214,.1)] hover:text-[#E7E0D6]"
            onClick={() => {
              setProject(openMenuProject);
              setEditOpen(true);
              closeMenu();
            }}
          >
            <Pencil size={14} />
            Редактировать
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[rgba(231,224,214,.82)] hover:bg-[rgba(231,224,214,.1)] hover:text-[#E7E0D6]"
            onClick={() => {
              toggleFavorite(openMenuProject.id);
              closeMenu();
            }}
          >
            <Star size={14} className={preferences.favoriteIds.includes(openMenuProject.id) ? 'text-[#AEA989]' : ''} fill={preferences.favoriteIds.includes(openMenuProject.id) ? 'currentColor' : 'none'} />
            {preferences.favoriteIds.includes(openMenuProject.id) ? 'Убрать из избранного' : 'Добавить в избранное'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[rgba(231,224,214,.82)] hover:bg-[rgba(231,224,214,.1)] hover:text-[#E7E0D6]"
            onClick={() => handleOpenGithub(openMenuProject)}
          >
            <ExternalLink size={14} />
            Открыть на GitHub
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[rgba(231,224,214,.82)] hover:bg-[rgba(231,224,214,.1)] hover:text-[#E7E0D6]"
            onClick={() => void handleCopyLink(openMenuProject)}
          >
            <Copy size={14} />
            Скопировать ссылку
          </button>
          <div role="separator" className="my-1 border-t border-[rgba(231,224,214,.1)]" />
          <button
            type="button"
            role="menuitem"
            disabled={loading}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-[#E7A49A] hover:bg-[rgba(161,108,98,.16)] disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => {
              setConfirmDelete(openMenuProject);
              closeMenu();
            }}
          >
            <Trash2 size={14} />
            Удалить с GitHub
          </button>
        </div>,
        document.body,
      )}

      {confirmDelete && (
        <div
          className="modal-overlay fixed inset-0 backdrop-blur-sm grid place-items-center z-50 p-3"
          data-closing={closingDelete}
          role="presentation"
          onMouseDown={event => event.target === event.currentTarget && closeConfirm()}
        >
          <div className="modal-panel w-[min(390px,100%)] rounded-2xl p-6" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="w-[47px] h-[47px] rounded-[13px] bg-[#FDE8E4] grid place-items-center mb-4">
              <Trash2 size={25} className="text-[#A16C62]" />
            </div>
            <h2 id="delete-title" className="text-[23px] font-semibold mb-1">Удалить репозиторий с GitHub?</h2>
            <p className="text-xs text-[#7D7482] leading-relaxed mb-2">
              Репозиторий <b className="text-[#261732]">{confirmDelete.name}</b> будет удалён с GitHub и исчезнет из Gitora.
            </p>
            <p className="text-xs text-[#A16C62] leading-relaxed mb-5">
              Это действие необратимо: будут удалены коммиты, ветки, файлы и другие данные репозитория.
            </p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                className="px-4 py-2 border border-[rgba(38,23,50,.12)] rounded-lg text-sm font-semibold"
                onClick={closeConfirm}
              >
                Отмена
              </button>
              <button
                className="px-4 py-2 bg-[#A16C62] text-white rounded-lg text-sm font-semibold disabled:opacity-40"
                onClick={handleDelete}
                disabled={loading}
              >
                Удалить с GitHub
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
