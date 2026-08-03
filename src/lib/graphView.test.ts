import { describe, expect, it } from 'vitest';
import {
  clampGraphZoom,
  GRAPH_VIEW_SETTINGS_KEY,
  readGraphViewPreferences,
  saveGraphViewPreferences,
  StorageLike,
} from './graphView';

function memoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, nextValue) => { values.set(key, nextValue); },
  };
}

describe('graph view preferences', () => {
  it('persists direction and zoom per project', () => {
    const storage = memoryStorage();
    saveGraphViewPreferences('repo-1', { direction: 'left', zoom: 1.4 }, storage);

    expect(storage.getItem(`${GRAPH_VIEW_SETTINGS_KEY}:repo-1`)).toContain('left');
    expect(readGraphViewPreferences('repo-1', storage)).toEqual({ direction: 'left', zoom: 1.4 });
    expect(readGraphViewPreferences('repo-2', storage)).toEqual({ direction: 'down', zoom: 1 });
  });

  it('migrates directions from the previous two-mode format', () => {
    const storage = memoryStorage();
    storage.setItem(`${GRAPH_VIEW_SETTINGS_KEY}:repo-legacy`, JSON.stringify({ direction: 'horizontal', zoom: 1 }));

    expect(readGraphViewPreferences('repo-legacy', storage).direction).toBe('right');
  });

  it('clamps zoom to the supported range and rounds steps', () => {
    expect(clampGraphZoom(0.12)).toBe(0.4);
    expect(clampGraphZoom(1.36)).toBe(1.4);
    expect(clampGraphZoom(3)).toBe(2);
  });
});
