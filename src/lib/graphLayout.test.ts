import { describe, expect, it } from 'vitest';
import { Branch, GitHubCommit } from '../types';
import { computeGraphLayout, generateEdgePath } from './graphLayout';

const commit = (sha: string, parents: string[], hour: number): GitHubCommit => ({
  sha,
  commit: {
    message: sha,
    author: { name: 'Test', date: `2026-01-01T${String(hour).padStart(2, '0')}:00:00Z` },
  },
  author: { login: 'tester', avatar_url: '' },
  parents: parents.map(parent => ({ sha: parent })),
});

const branches: Branch[] = [
  { name: 'main', tipSha: 'merge', color: '#261732' },
  { name: 'feature', tipSha: 'feature-2', color: '#C58C75' },
];

describe('computeGraphLayout', () => {
  it('keeps merged feature commits in their branch lane', () => {
    const layout = computeGraphLayout([
      commit('merge', ['main-2', 'feature-2'], 5),
      commit('main-2', ['base'], 4),
      commit('feature-2', ['feature-1'], 3),
      commit('feature-1', ['base'], 2),
      commit('base', [], 1),
    ], branches);

    const bySha = new Map(layout.nodes.map(node => [node.sha, node]));
    expect(bySha.get('merge')?.branch).toBe('main');
    expect(bySha.get('base')?.branch).toBe('main');
    expect(bySha.get('feature-1')?.branch).toBe('feature');
    expect(bySha.get('feature-2')?.lane).toBe(1);
    expect(layout.edges).toHaveLength(5);
  });

  it('ignores parents outside the fetched history', () => {
    const layout = computeGraphLayout([
      commit('merge', ['missing'], 5),
    ], [{ name: 'main', tipSha: 'merge', color: '#261732' }]);

    expect(layout.nodes).toHaveLength(1);
    expect(layout.edges).toHaveLength(0);
  });
});

describe('generateEdgePath', () => {
  it('uses a straight line inside one lane', () => {
    expect(generateEdgePath({
      from: 'a',
      to: 'b',
      fromX: 80,
      fromY: 50,
      toX: 80,
      toY: 114,
      color: '#000',
      type: 'normal',
    })).toBe('M 80 50 L 80 114');
  });
});
