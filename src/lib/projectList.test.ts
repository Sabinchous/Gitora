import { describe, expect, it } from 'vitest';
import {
  filterAndSortProjects,
  PROJECT_LIST_SETTINGS_KEY,
  readProjectListPreferences,
  saveProjectListPreferences,
  StorageLike,
} from './projectList';
import { Project } from '../types';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: '1',
    name: 'Alpha',
    repo: 'owner/alpha',
    color: '#AEA989',
    commits: 0,
    branches: 0,
    updated: '01.01.2026',
    updatedAt: '2026-01-01T00:00:00Z',
    description: '',
    isPrivate: false,
    defaultBranch: 'main',
    ...overrides,
  };
}

function memoryStorage(initialValue: string | null = null): StorageLike & { value: string | null } {
  return {
    value: initialValue,
    getItem: () => initialValue,
    setItem: (_key, value) => {
      initialValue = value;
    },
  };
}

describe('project list helpers', () => {
  const projects = [
    makeProject({ id: '1', name: 'Alpha', updatedAt: '2026-01-01T00:00:00Z' }),
    makeProject({ id: '2', name: 'Beta', repo: 'owner/beta', updatedAt: '2026-03-01T00:00:00Z', isPrivate: true }),
    makeProject({ id: '3', name: 'Gamma', repo: 'owner/gamma', updatedAt: '2026-02-01T00:00:00Z' }),
  ];

  it('filters by repository name without mutating the source list', () => {
    const result = filterAndSortProjects(projects, 'ga', 'updated', []);

    expect(result.map(project => project.name)).toEqual(['Gamma']);
    expect(projects.map(project => project.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('sorts by name and by recent update', () => {
    expect(filterAndSortProjects(projects, '', 'name', []).map(project => project.name))
      .toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(filterAndSortProjects(projects, '', 'updated', []).map(project => project.name))
      .toEqual(['Beta', 'Gamma', 'Alpha']);
  });

  it('places favorites first while keeping the recent-update secondary order', () => {
    const result = filterAndSortProjects(projects, '', 'favorites', ['1', '3']);

    expect(result.map(project => project.name)).toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('filters private and public repositories', () => {
    expect(filterAndSortProjects(projects, '', 'private', []).map(project => project.name)).toEqual(['Beta']);
    expect(filterAndSortProjects(projects, '', 'public', []).map(project => project.name))
      .toEqual(['Gamma', 'Alpha']);
  });

  it('round-trips preferences and falls back for invalid persisted data', () => {
    const storage = memoryStorage();
    saveProjectListPreferences({ sortMode: 'favorites', favoriteIds: ['2'] }, storage);

    expect(storage.getItem(PROJECT_LIST_SETTINGS_KEY)).toContain('favorites');
    expect(readProjectListPreferences(storage)).toEqual({ sortMode: 'favorites', favoriteIds: ['2'] });

    const invalidStorage = memoryStorage('{"sortMode":"invalid","favoriteIds":["2",4]}');
    expect(readProjectListPreferences(invalidStorage)).toEqual({ sortMode: 'updated', favoriteIds: ['2'] });
  });
});
