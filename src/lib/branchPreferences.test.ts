import { describe, expect, it } from 'vitest';
import {
  branchPreferenceStorageKey,
  mergeBranchPreferences,
  migrateBranchPreference,
  readBranchPreferences,
  removeBranchPreference,
  updateBranchPreference,
} from './branchPreferences';

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('branch visual preferences', () => {
  it('creates stable defaults and restores saved values per repository', () => {
    const store = storage();
    const first = mergeBranchPreferences('Sabinchous/Gitora', [
      { name: 'main', tipSha: 'a' },
      { name: 'feature', tipSha: 'b' },
    ], store);
    expect(first[0].direction).toBe('auto');
    expect(first[1].color).toBeTruthy();

    updateBranchPreference('Sabinchous/Gitora', 'feature', { color: '#B35D56', direction: 'right' }, store);
    const restored = mergeBranchPreferences('Sabinchous/Gitora', [
      { name: 'main', tipSha: 'new-a' },
      { name: 'feature', tipSha: 'new-b' },
    ], store);
    expect(restored[1]).toMatchObject({ color: '#B35D56', direction: 'right' });
    expect(store.getItem(branchPreferenceStorageKey('Sabinchous/Gitora'))).toContain('feature');
  });

  it('migrates preferences on rename and removes them on delete', () => {
    const store = storage();
    mergeBranchPreferences('repo', [{ name: 'main', tipSha: 'a' }, { name: 'old', tipSha: 'b' }], store);
    updateBranchPreference('repo', 'old', { direction: 'left' }, store);
    migrateBranchPreference('repo', 'old', 'new', store);
    expect(readBranchPreferences('repo', store).new.direction).toBe('left');
    expect(readBranchPreferences('repo', store).old).toBeUndefined();
    removeBranchPreference('repo', 'new', store);
    expect(readBranchPreferences('repo', store).new).toBeUndefined();
  });
});
