import { Project } from '../types';

export type ProjectSortMode = 'updated' | 'name' | 'favorites' | 'private' | 'public' | 'custom';

export interface ProjectListPreferences {
  sortMode: ProjectSortMode;
  favoriteIds: string[];
  orderIds: string[];
  iconByProjectId: Record<string, string>;
  imageByProjectId: Record<string, string>;
  seenCommitByProjectId: Record<string, string>;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export const PROJECT_LIST_SETTINGS_KEY = 'gitora-project-list-settings';

const DEFAULT_PREFERENCES: ProjectListPreferences = {
  sortMode: 'updated',
  favoriteIds: [],
  orderIds: [],
  iconByProjectId: {},
  imageByProjectId: {},
  seenCommitByProjectId: {},
};

const SORT_MODES: ProjectSortMode[] = ['updated', 'name', 'favorites', 'private', 'public', 'custom'];
export const MAX_PROJECT_IMAGE_DATA_URL_LENGTH = 800_000;

function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isSortMode(value: unknown): value is ProjectSortMode {
  return typeof value === 'string' && SORT_MODES.includes(value as ProjectSortMode);
}

export function normalizeProjectIcon(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = Array.from(value.trim()).slice(0, 8).join('');
  return normalized || null;
}

function readProjectIcons(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce<Record<string, string>>((icons, [projectId, icon]) => {
    const normalized = normalizeProjectIcon(icon);
    if (normalized) icons[projectId] = normalized;
    return icons;
  }, {});
}

export function normalizeProjectImage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(normalized)) return null;
  return normalized.length <= MAX_PROJECT_IMAGE_DATA_URL_LENGTH ? normalized : null;
}

function readProjectImages(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce<Record<string, string>>((images, [projectId, image]) => {
    const normalized = normalizeProjectImage(image);
    if (normalized) images[projectId] = normalized;
    return images;
  }, {});
}

function readSeenCommits(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce<Record<string, string>>((commits, [projectId, sha]) => {
    if (typeof sha === 'string' && /^[a-f0-9]{7,64}$/i.test(sha.trim())) commits[projectId] = sha.trim();
    return commits;
  }, {});
}

export function readProjectListPreferences(storage: StorageLike | null = getBrowserStorage()): ProjectListPreferences {
  if (!storage) return { ...DEFAULT_PREFERENCES, favoriteIds: [], orderIds: [] };

  try {
    const raw = storage.getItem(PROJECT_LIST_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES, favoriteIds: [], orderIds: [] };
    const parsed = JSON.parse(raw) as Partial<ProjectListPreferences>;
    return {
      sortMode: isSortMode(parsed.sortMode) ? parsed.sortMode : DEFAULT_PREFERENCES.sortMode,
      favoriteIds: Array.isArray(parsed.favoriteIds)
        ? parsed.favoriteIds.filter((id): id is string => typeof id === 'string')
        : [],
      orderIds: Array.isArray(parsed.orderIds)
        ? parsed.orderIds.filter((id): id is string => typeof id === 'string')
        : [],
      iconByProjectId: readProjectIcons(parsed.iconByProjectId),
      imageByProjectId: readProjectImages(parsed.imageByProjectId),
      seenCommitByProjectId: readSeenCommits(parsed.seenCommitByProjectId),
    };
  } catch {
    return { ...DEFAULT_PREFERENCES, favoriteIds: [], orderIds: [] };
  }
}

export function saveProjectListPreferences(
  preferences: ProjectListPreferences,
  storage: StorageLike | null = getBrowserStorage(),
): void {
  if (!storage) return;

  try {
    storage.setItem(PROJECT_LIST_SETTINGS_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

function compareByUpdated(a: Project, b: Project): number {
  const updatedDifference = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  if (Number.isFinite(updatedDifference) && updatedDifference !== 0) return updatedDifference;
  return a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
}

function compareByName(a: Project, b: Project): number {
  return a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }) || compareByUpdated(a, b);
}

export function filterAndSortProjects(
  projects: Project[],
  query: string,
  sortMode: ProjectSortMode,
  favoriteIds: string[],
  orderIds: string[] = [],
): Project[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const favoriteSet = new Set(favoriteIds);
  const filtered = projects.filter((project) => {
    const matchesQuery = !normalizedQuery
      || project.name.toLocaleLowerCase('ru-RU').includes(normalizedQuery);
    const matchesVisibility = sortMode === 'private'
      ? project.isPrivate
      : sortMode === 'public'
        ? !project.isPrivate
        : true;
    return matchesQuery && matchesVisibility;
  });

  if (sortMode === 'custom') {
    const orderIndex = new Map(orderIds.map((id, index) => [id, index]));
    return [...filtered].sort((a, b) => {
      const aIndex = orderIndex.get(a.id);
      const bIndex = orderIndex.get(b.id);
      if (aIndex === undefined && bIndex === undefined) return compareByUpdated(a, b);
      if (aIndex === undefined) return 1;
      if (bIndex === undefined) return -1;
      return aIndex - bIndex;
    });
  }

  return [...filtered].sort((a, b) => {
    if (sortMode === 'name') return compareByName(a, b);
    if (sortMode === 'favorites') {
      const favoriteDifference = Number(favoriteSet.has(b.id)) - Number(favoriteSet.has(a.id));
      if (favoriteDifference !== 0) return favoriteDifference;
    }
    return compareByUpdated(a, b);
  });
}

export function reorderProjectIds(projectIds: string[], draggedId: string, targetId: string): string[] {
  if (draggedId === targetId) return [...projectIds];

  const nextIds = projectIds.filter(id => id !== draggedId);
  const targetIndex = nextIds.indexOf(targetId);
  if (targetIndex === -1) return [...projectIds];

  nextIds.splice(targetIndex, 0, draggedId);
  return nextIds;
}
