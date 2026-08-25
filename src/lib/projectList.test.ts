import { describe, expect, it } from 'vitest';
import {
  filterAndSortProjects,
  normalizeProjectImage,
  normalizeProjectIcon,
  PROJECT_LIST_SETTINGS_KEY,
  readProjectListPreferences,
  reorderProjectIds,
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

  it('keeps the custom order when filtering and appends new projects after ordered ones', () => {
    expect(filterAndSortProjects(projects, 'a', 'custom', [], ['3', '1', '2']).map(project => project.name))
      .toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(filterAndSortProjects(projects, '', 'custom', [], ['3', '1']).map(project => project.name))
      .toEqual(['Gamma', 'Alpha', 'Beta']);
  });

  it('moves a project before the dragged-to project without mutating the source order', () => {
    const projectIds = ['1', '2', '3'];

    expect(reorderProjectIds(projectIds, '3', '1')).toEqual(['3', '1', '2']);
    expect(reorderProjectIds(projectIds, '2', 'missing')).toEqual(projectIds);
    expect(projectIds).toEqual(['1', '2', '3']);
  });

  it('filters private and public repositories', () => {
    expect(filterAndSortProjects(projects, '', 'private', []).map(project => project.name)).toEqual(['Beta']);
    expect(filterAndSortProjects(projects, '', 'public', []).map(project => project.name))
      .toEqual(['Gamma', 'Alpha']);
  });

  it('round-trips preferences and falls back for invalid persisted data', () => {
    const storage = memoryStorage();
    saveProjectListPreferences({
      sortMode: 'favorites',
      favoriteIds: ['2'],
      orderIds: ['3', '2', '1'],
      iconByProjectId: { '2': '🚀' },
      imageByProjectId: { '1': 'data:image/png;base64,AA==' },
      seenCommitByProjectId: { '1': 'a'.repeat(40) },
    }, storage);

    expect(storage.getItem(PROJECT_LIST_SETTINGS_KEY)).toContain('favorites');
    expect(readProjectListPreferences(storage)).toEqual({
      sortMode: 'favorites',
      favoriteIds: ['2'],
      orderIds: ['3', '2', '1'],
      iconByProjectId: { '2': '🚀' },
      imageByProjectId: { '1': 'data:image/png;base64,AA==' },
      seenCommitByProjectId: { '1': 'a'.repeat(40) },
    });

    const invalidStorage = memoryStorage('{"sortMode":"invalid","favoriteIds":["2",4],"orderIds":["3",5],"iconByProjectId":{"2":"  🎨 ","3":4,"4":""},"imageByProjectId":{"2":"data:image/webp;base64,AA==","3":"https://example.com/image.png","4":4},"seenCommitByProjectId":{"2":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","3":"not-a-sha"}}');
    expect(readProjectListPreferences(invalidStorage)).toEqual({
      sortMode: 'updated',
      favoriteIds: ['2'],
      orderIds: ['3'],
      iconByProjectId: { '2': '🎨' },
      imageByProjectId: { '2': 'data:image/webp;base64,AA==' },
      seenCommitByProjectId: { '2': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
    });
  });

  it('normalizes custom project icons without storing empty or oversized values', () => {
    expect(normalizeProjectIcon('  🚀  ')).toBe('🚀');
    expect(normalizeProjectIcon('')).toBeNull();
    expect(normalizeProjectIcon('123456789')).toBe('12345678');
    expect(normalizeProjectIcon(42)).toBeNull();
  });

  it('accepts only compact local image data URLs', () => {
    expect(normalizeProjectImage(' data:image/png;base64,AA== ')).toBe('data:image/png;base64,AA==');
    expect(normalizeProjectImage('https://example.com/project.png')).toBeNull();
    expect(normalizeProjectImage('data:text/plain;base64,AA==')).toBeNull();
    expect(normalizeProjectImage(42)).toBeNull();
  });
});
