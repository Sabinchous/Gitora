import { Project } from '../types';

export type ProjectSortMode = 'updated' | 'name' | 'favorites' | 'private' | 'public';

export interface ProjectListPreferences {
  sortMode: ProjectSortMode;
  favoriteIds: string[];
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export const PROJECT_LIST_SETTINGS_KEY = 'gitora-project-list-settings';

const DEFAULT_PREFERENCES: ProjectListPreferences = {
  sortMode: 'updated',
  favoriteIds: [],
};

const SORT_MODES: ProjectSortMode[] = ['updated', 'name', 'favorites', 'private', 'public'];

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

export function readProjectListPreferences(storage: StorageLike | null = getBrowserStorage()): ProjectListPreferences {
  if (!storage) return { ...DEFAULT_PREFERENCES, favoriteIds: [] };

  try {
    const raw = storage.getItem(PROJECT_LIST_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES, favoriteIds: [] };
    const parsed = JSON.parse(raw) as Partial<ProjectListPreferences>;
    return {
      sortMode: isSortMode(parsed.sortMode) ? parsed.sortMode : DEFAULT_PREFERENCES.sortMode,
      favoriteIds: Array.isArray(parsed.favoriteIds)
        ? parsed.favoriteIds.filter((id): id is string => typeof id === 'string')
        : [],
    };
  } catch {
    return { ...DEFAULT_PREFERENCES, favoriteIds: [] };
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

  return [...filtered].sort((a, b) => {
    if (sortMode === 'name') return compareByName(a, b);
    if (sortMode === 'favorites') {
      const favoriteDifference = Number(favoriteSet.has(b.id)) - Number(favoriteSet.has(a.id));
      if (favoriteDifference !== 0) return favoriteDifference;
    }
    return compareByUpdated(a, b);
  });
}
