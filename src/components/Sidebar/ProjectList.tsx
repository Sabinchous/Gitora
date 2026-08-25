import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BellDot,
  Check,
  Copy,
  ExternalLink,
  Globe2,
  GripVertical,
  ImagePlus,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  SlidersHorizontal,
  SmilePlus,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Project } from '../../types';
import {
  filterAndSortProjects,
  MAX_PROJECT_IMAGE_DATA_URL_LENGTH,
  normalizeProjectIcon,
  normalizeProjectImage,
  ProjectSortMode,
  readProjectListPreferences,
  reorderProjectIds,
  saveProjectListPreferences,
} from '../../lib/projectList';
import { SelectMenu } from '../common/SelectMenu';

const SORT_OPTIONS: { value: ProjectSortMode; label: string }[] = [
  { value: 'updated', label: 'Недавно обновлённые' },
  { value: 'name', label: 'По названию A→Z' },
  { value: 'favorites', label: 'Избранные сверху' },
  { value: 'private', label: 'Только приватные' },
  { value: 'public', label: 'Только публичные' },
  { value: 'custom', label: 'Мой порядок' },
];

const PROJECT_ICON_OPTIONS = ['🚀', '🎨', '💡', '🧪', '📦', '🛠️', '🌱', '🎵', '🔥', '🧭', '📝', '🪄'];
const PROJECT_MENU_WIDTH = 224;
const PROJECT_MENU_HEIGHT = 238;
const PROJECT_ICON_MENU_HEIGHT = 590;
const MAX_PROJECT_IMAGE_DIMENSION = 128;
const MAX_PROJECT_IMAGE_FILE_SIZE = 8 * 1024 * 1024;

interface MenuPosition {
  top: number;
  left: number;
}

interface MenuAnchor {
  top: number;
  bottom: number;
  right: number;
}

interface LatestExternalCommit {
  sha: string;
  authorLogin: string;
}

interface ProjectCommitCheck {
  projectId: string;
  status: 'resolved' | 'failed';
  commit: LatestExternalCommit | null;
}

function readProjectImage(file: File): Promise<string> {
  const looksLikeImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
  if (!looksLikeImage) return Promise.reject(new Error('Выберите файл изображения'));
  if (file.size > MAX_PROJECT_IMAGE_FILE_SIZE) {
    return Promise.reject(new Error('Изображение слишком большое. Выберите файл до 8 МБ'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать изображение'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Не удалось открыть изображение'));
      image.onload = () => {
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        const largestSide = Math.max(sourceWidth, sourceHeight);
        if (!largestSide) {
          reject(new Error('У изображения нет размера'));
          return;
        }

        const scale = Math.min(1, MAX_PROJECT_IMAGE_DIMENSION / largestSide);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Браузер не поддерживает обработку изображения'));
          return;
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const compressed = normalizeProjectImage(canvas.toDataURL('image/webp', 0.84));
        if (!compressed || compressed.length > MAX_PROJECT_IMAGE_DATA_URL_LENGTH) {
          reject(new Error('Не удалось сжать изображение до безопасного размера'));
          return;
        }
        resolve(compressed);
      };
      image.src = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(file);
  });
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
    connected,
    user,
    getLatestCommit,
  } = useApp();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [preferences, setPreferences] = useState(readProjectListPreferences);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [customIconDraft, setCustomIconDraft] = useState('');
  const [imageLoading, setImageLoading] = useState(false);
  const [latestExternalCommitByProjectId, setLatestExternalCommitByProjectId] = useState<Record<string, LatestExternalCommit>>({});
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);
  const [closingDelete, setClosingDelete] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);
  const projectImageInputRef = useRef<HTMLInputElement>(null);

  const closeMenu = () => {
    setOpenMenuId(null);
    setMenuPosition(null);
    setMenuAnchor(null);
    setIconPickerOpen(false);
    setCustomIconDraft('');
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 150);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    saveProjectListPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    if (!connected || !user?.login || projects.length === 0) {
      setLatestExternalCommitByProjectId({});
      return undefined;
    }

    let cancelled = false;
    const currentLogin = user.login.trim().toLocaleLowerCase();

    const checkLatestCommits = async () => {
      const checks = await Promise.all(projects.map(async (item): Promise<ProjectCommitCheck> => {
        const [owner, repo] = item.repo.split('/');
        if (!owner || !repo) return { projectId: item.id, status: 'resolved', commit: null };

        try {
          const latest = await getLatestCommit(owner, repo);
          const authorLogin = latest?.author?.login?.trim();
          if (!latest?.sha || !authorLogin || authorLogin.toLocaleLowerCase() === currentLogin) {
            return { projectId: item.id, status: 'resolved', commit: null };
          }
          return {
            projectId: item.id,
            status: 'resolved',
            commit: { sha: latest.sha, authorLogin },
          };
        } catch {
          return { projectId: item.id, status: 'failed', commit: null };
        }
      }));

      if (cancelled) return;
      const projectIds = new Set(projects.map(item => item.id));
      setLatestExternalCommitByProjectId(current => {
        const next = Object.fromEntries(
          Object.entries(current).filter(([projectId]) => projectIds.has(projectId)),
        ) as Record<string, LatestExternalCommit>;
        checks.forEach(check => {
          if (check.status === 'failed') return;
          if (check.commit) next[check.projectId] = check.commit;
          else delete next[check.projectId];
        });
        return next;
      });
    };

    void checkLatestCommits();
    return () => { cancelled = true; };
  }, [connected, projects, user?.login]);

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
      preferences.orderIds,
    ),
    [projects, debouncedQuery, preferences.sortMode, preferences.favoriteIds, preferences.orderIds],
  );

  const projectOrderIds = useMemo(() => {
    const sortedProjects = filterAndSortProjects(
      projects,
      '',
      preferences.sortMode,
      preferences.favoriteIds,
      preferences.orderIds,
    );
    const sortedIds = new Set(sortedProjects.map(item => item.id));
    return [
      ...sortedProjects.map(item => item.id),
      ...projects.filter(item => !sortedIds.has(item.id)).map(item => item.id),
    ];
  }, [projects, preferences.sortMode, preferences.favoriteIds, preferences.orderIds]);

  const openMenuProject = openMenuId ? projects.find(item => item.id === openMenuId) ?? null : null;

  const setProjectIcon = (projectId: string, icon: string | null) => {
    setPreferences(current => {
      const iconByProjectId = { ...current.iconByProjectId };
      const imageByProjectId = { ...current.imageByProjectId };
      if (icon) iconByProjectId[projectId] = icon;
      else delete iconByProjectId[projectId];
      delete imageByProjectId[projectId];
      return { ...current, iconByProjectId, imageByProjectId };
    });
    closeMenu();
  };

  const setProjectImage = (projectId: string, image: string | null) => {
    setPreferences(current => {
      const iconByProjectId = { ...current.iconByProjectId };
      const imageByProjectId = { ...current.imageByProjectId };
      delete iconByProjectId[projectId];
      if (image) imageByProjectId[projectId] = image;
      else delete imageByProjectId[projectId];
      return { ...current, iconByProjectId, imageByProjectId };
    });
    closeMenu();
  };

  const getMenuPosition = (anchor: MenuAnchor, menuHeight: number): MenuPosition => {
    const left = Math.max(8, Math.min(anchor.right - PROJECT_MENU_WIDTH, window.innerWidth - PROJECT_MENU_WIDTH - 8));
    const top = anchor.bottom + menuHeight + 8 > window.innerHeight
      ? Math.max(8, anchor.top - menuHeight - 8)
      : anchor.bottom + 8;
    return { top, left };
  };

  const toggleIconPicker = () => {
    const nextOpen = !iconPickerOpen;
    setIconPickerOpen(nextOpen);
    if (nextOpen && openMenuProject) {
      setCustomIconDraft(preferences.iconByProjectId[openMenuProject.id] ?? '');
    }
    if (menuAnchor) setMenuPosition(getMenuPosition(menuAnchor, nextOpen ? PROJECT_ICON_MENU_HEIGHT : PROJECT_MENU_HEIGHT));
  };

  const applyCustomIcon = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!openMenuProject) return;
    const icon = normalizeProjectIcon(customIconDraft);
    if (!icon) {
      notify('Введите символ для иконки проекта');
      return;
    }
    setProjectIcon(openMenuProject.id, icon);
  };

  const handleProjectImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const projectId = openMenuProject?.id;
    event.target.value = '';
    if (!file || !projectId) return;

    setImageLoading(true);
    try {
      const image = await readProjectImage(file);
      setProjectImage(projectId, image);
      notify('Картинка проекта сохранена');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Не удалось сохранить картинку проекта');
    } finally {
      setImageLoading(false);
    }
  };

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
    const latestExternalCommit = latestExternalCommitByProjectId[nextProject.id];
    if (latestExternalCommit) {
      setPreferences(current => current.seenCommitByProjectId[nextProject.id] === latestExternalCommit.sha
        ? current
        : {
          ...current,
          seenCommitByProjectId: {
            ...current.seenCommitByProjectId,
            [nextProject.id]: latestExternalCommit.sha,
          },
        });
    }
    setProject(nextProject);
    setMobileOpen(false);
    closeMenu();
  };

  const finishDragging = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, projectId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', projectId);
    setDraggingId(projectId);
    setDragOverId(null);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>, projectId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (projectId !== draggingId) setDragOverId(projectId);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('text/plain') || draggingId;
    if (!draggedId || draggedId === targetId) {
      finishDragging();
      return;
    }

    setPreferences(current => ({
      ...current,
      sortMode: 'custom',
      orderIds: reorderProjectIds(projectOrderIds, draggedId, targetId),
    }));
    finishDragging();
  };

  const openProjectMenu = (event: React.MouseEvent<HTMLButtonElement>, nextProject: Project) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchor = { top: rect.top, bottom: rect.bottom, right: rect.right };
    setMenuAnchor(anchor);
    setMenuPosition(getMenuPosition(anchor, PROJECT_MENU_HEIGHT));
    setIconPickerOpen(false);
    setCustomIconDraft('');
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
  const openMenuProjectIcon = openMenuProject ? preferences.iconByProjectId[openMenuProject.id] : null;
  const openMenuProjectImage = openMenuProject ? preferences.imageByProjectId[openMenuProject.id] : null;
  const isDefaultProjectAppearance = !openMenuProjectIcon && !openMenuProjectImage;

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
            const projectIcon = preferences.iconByProjectId[item.id];
            const projectImage = preferences.imageByProjectId[item.id];
            const isFavorite = preferences.favoriteIds.includes(item.id);
            const isSelected = project?.id === item.id;
            const latestExternalCommit = latestExternalCommitByProjectId[item.id];
            const hasExternalUpdate = Boolean(
              latestExternalCommit
              && preferences.seenCommitByProjectId[item.id] !== latestExternalCommit.sha,
            );
            const externalUpdateLabel = latestExternalCommit
              ? `Новое обновление ветки ${item.defaultBranch} от @${latestExternalCommit.authorLogin}`
              : '';

            return (
              <div
                key={item.id}
                draggable={!loading}
                data-project-dragging={draggingId === item.id ? 'true' : undefined}
                className={`relative group cursor-grab rounded-lg transition-[opacity,background-color,transform] duration-150 active:cursor-grabbing ${draggingId === item.id ? 'scale-[0.98] opacity-40' : ''} ${dragOverId === item.id && draggingId !== item.id ? 'bg-[rgba(174,169,137,.16)]' : ''}`}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                onDragStart={event => handleDragStart(event, item.id)}
                onDragOver={event => handleDragOver(event, item.id)}
                onDrop={event => handleDrop(event, item.id)}
                onDragEnd={finishDragging}
              >
                <button
                  data-project-row={item.id}
                  title="Зажмите и перетащите, чтобы изменить порядок"
                  className={`flex items-center gap-2.5 w-full border-0 bg-transparent text-[rgba(231,224,214,.65)] p-2 pr-11 rounded-lg text-left cursor-pointer relative hover:bg-[rgba(231,224,214,.08)] hover:text-[#E7E0D6] focus-visible:bg-[rgba(231,224,214,.08)] ${isSelected ? 'bg-[rgba(231,224,214,.1)] text-[#E7E0D6]' : ''}`}
                  onClick={() => selectProject(item)}
                >
                  <span className="grid w-2 flex-none place-items-center text-[rgba(231,224,214,.4)] opacity-0 transition-opacity group-hover:opacity-70" aria-hidden="true">
                    <GripVertical size={13} />
                  </span>
                  <span
                    className="relative w-7 h-7 rounded-lg grid place-items-center flex-none text-base leading-none"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${item.color}, transparent 78%)`,
                      color: item.color,
                    }}
                    title={projectImage
                      ? `Картинка проекта. ${item.isPrivate ? 'Приватный репозиторий' : 'Публичный репозиторий'}`
                      : projectIcon
                        ? `Иконка проекта: ${projectIcon}. ${item.isPrivate ? 'Приватный репозиторий' : 'Публичный репозиторий'}`
                      : item.isPrivate ? 'Приватный репозиторий' : 'Публичный репозиторий'}
                    aria-hidden="true"
                  >
                    {projectImage ? (
                      <img src={projectImage} alt="" className="h-full w-full rounded-lg object-cover" />
                    ) : projectIcon ? <span>{projectIcon}</span> : <VisibilityIcon size={16} />}
                    {(projectImage || projectIcon) && (
                      <span className="absolute -bottom-0.5 -right-0.5 grid h-3 w-3 place-items-center rounded-full bg-[#261732] text-[#E7E0D6]">
                        <VisibilityIcon size={8} />
                      </span>
                    )}
                  </span>
                  <span className="flex-1 min-w-0">
                    <b className="block text-sm truncate">{item.name}</b>
                    <small className="block text-xs text-[rgba(231,224,214,.38)] mt-0.5 truncate">{item.repo}</small>
                  </span>
                  <span className="flex flex-none items-center gap-1.5">
                    {hasExternalUpdate && latestExternalCommit && (
                      <span
                        role="img"
                        data-project-update="external"
                        className="grid h-4 w-4 place-items-center text-[#C58C75]"
                        title={`${externalUpdateLabel}. Откройте проект, чтобы отметить его просмотренным.`}
                        aria-label={`${externalUpdateLabel}. Откройте проект, чтобы отметить его просмотренным.`}
                      >
                        <BellDot size={13} strokeWidth={2.2} />
                      </span>
                    )}
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
          className="fixed z-[100] max-h-[calc(100vh-16px)] w-56 overflow-y-auto rounded-xl border border-[rgba(231,224,214,.12)] bg-[#261732] p-1.5 text-[#E7E0D6] shadow-[0_16px_40px_rgba(10,4,17,.35)]"
          style={{ top: menuPosition.top, left: menuPosition.left }}
        >
          <button
            ref={firstMenuItemRef}
            type="button"
            role="menuitem"
            aria-expanded={iconPickerOpen}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[rgba(231,224,214,.82)] hover:bg-[rgba(231,224,214,.1)] hover:text-[#E7E0D6]"
            onClick={toggleIconPicker}
          >
            <SmilePlus size={14} />
            Настроить иконку
          </button>

          {iconPickerOpen && (
            <div className="mx-1 my-1 rounded-lg bg-[rgba(231,224,214,.06)] p-2" aria-label="Выбор иконки проекта">
              <p className="px-1 pb-1 text-xs font-semibold text-[rgba(231,224,214,.72)]">Иконка проекта</p>
              <input
                ref={projectImageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleProjectImageChange}
              />
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[rgba(231,224,214,.78)] hover:bg-[rgba(231,224,214,.08)] disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => projectImageInputRef.current?.click()}
                disabled={imageLoading}
                aria-label={openMenuProjectImage ? 'Заменить картинку проекта' : 'Выбрать картинку проекта'}
              >
                <span className="flex items-center gap-2">
                  <ImagePlus size={14} />
                  {imageLoading ? 'Обрабатываем…' : openMenuProjectImage ? 'Заменить картинку' : 'Выбрать картинку из папки'}
                </span>
                {openMenuProjectImage && <span className="text-[rgba(231,224,214,.46)]">выбрана</span>}
              </button>
              {openMenuProjectImage && (
                <div className="mt-1 flex items-center gap-2 rounded-md bg-[rgba(231,224,214,.05)] px-2 py-1.5">
                  <img src={openMenuProjectImage} alt="" className="h-7 w-7 rounded-md object-cover" />
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-xs text-[rgba(231,224,214,.58)] hover:text-[#E7E0D6]"
                    onClick={() => setProjectImage(openMenuProject.id, null)}
                  >
                    Убрать картинку
                  </button>
                </div>
              )}
              <button
                type="button"
                className={`mt-1 flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs ${isDefaultProjectAppearance ? 'bg-[rgba(174,169,137,.22)] text-[#E7E0D6]' : 'text-[rgba(231,224,214,.72)] hover:bg-[rgba(231,224,214,.08)]'}`}
                onClick={() => setProjectIcon(openMenuProject.id, null)}
                aria-pressed={isDefaultProjectAppearance}
              >
                <span className="flex items-center gap-2">
                  {openMenuProject.isPrivate ? <LockKeyhole size={14} /> : <Globe2 size={14} />}
                  Автоматически
                </span>
                {isDefaultProjectAppearance && <Check size={14} />}
              </button>
              <div className="mt-1 grid grid-cols-6 gap-1" role="group" aria-label="Готовые иконки">
                {PROJECT_ICON_OPTIONS.map(icon => (
                  <button
                    key={icon}
                    type="button"
                    className={`grid h-7 w-7 place-items-center rounded-md text-base leading-none ${preferences.iconByProjectId[openMenuProject.id] === icon ? 'bg-[#AEA989] text-[#261732]' : 'text-[#E7E0D6] hover:bg-[rgba(231,224,214,.12)]'}`}
                    onClick={() => setProjectIcon(openMenuProject.id, icon)}
                    aria-label={`Установить иконку ${icon}`}
                    aria-pressed={preferences.iconByProjectId[openMenuProject.id] === icon}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <form className="mt-2 flex items-center gap-1.5" onSubmit={applyCustomIcon}>
                <label className="sr-only" htmlFor="project-custom-icon">Свой символ</label>
                <input
                  id="project-custom-icon"
                  value={customIconDraft}
                  onChange={event => setCustomIconDraft(event.target.value)}
                  placeholder="★"
                  maxLength={8}
                  className="h-8 min-w-0 flex-1 rounded-md border border-[rgba(231,224,214,.14)] bg-[rgba(231,224,214,.08)] px-2 text-center text-base text-[#E7E0D6] placeholder:text-[rgba(231,224,214,.38)] outline-none focus:border-[rgba(174,169,137,.72)]"
                />
                <button
                  type="submit"
                  className="h-8 rounded-md bg-[#AEA989] px-2.5 text-xs font-semibold text-[#261732] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={!normalizeProjectIcon(customIconDraft)}
                  aria-label="Применить свой символ"
                >
                  Готово
                </button>
              </form>
              {(openMenuProjectIcon || openMenuProjectImage) && (
                <button
                  type="button"
                  className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-xs text-[rgba(231,224,214,.5)] hover:bg-[rgba(231,224,214,.08)] hover:text-[#E7E0D6]"
                  onClick={() => setProjectIcon(openMenuProject.id, null)}
                >
                  <RotateCcw size={12} />
                  Вернуть стандартную иконку
                </button>
              )}
            </div>
          )}

          <button
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

      {confirmDelete && createPortal(
        <div
          className="modal-overlay fixed inset-0 z-50 grid place-items-center p-3 backdrop-blur-sm"
          data-closing={closingDelete}
          role="presentation"
          onMouseDown={event => event.target === event.currentTarget && closeConfirm()}
        >
          <div className="modal-panel w-[min(420px,100%)] rounded-2xl p-5 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description delete-warning">
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--danger-soft)] text-[#A16C62]">
              <Trash2 size={22} />
            </div>
            <h2 id="delete-title" className="text-xl font-semibold leading-tight">Удалить репозиторий?</h2>
            <p id="delete-description" className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              <b className="text-[var(--ink)]">{confirmDelete.name}</b> будет удалён с GitHub и исчезнет из Gitora.
            </p>
            <p id="delete-warning" className="mt-4 rounded-lg bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[#A16C62]">
              Это действие необратимо. Удалятся коммиты, ветки, файлы и другие данные репозитория.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="min-h-10 w-full rounded-lg border border-[var(--line)] px-3 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)]"
                onClick={closeConfirm}
              >
                Отмена
              </button>
              <button
                type="button"
                className="min-h-10 w-full whitespace-nowrap rounded-lg bg-[#A16C62] px-3 text-sm font-semibold text-white hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--sage)] disabled:cursor-not-allowed disabled:opacity-40"
                onClick={handleDelete}
                disabled={loading}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
