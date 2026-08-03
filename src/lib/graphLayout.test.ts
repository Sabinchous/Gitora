import { describe, expect, it } from 'vitest';
import { Branch, GitHubCommit } from '../types';
import { computeGraphLayout, generateEdgePath, orientGraphLayout } from './graphLayout';

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
  { name: 'main', tipSha: 'merge', color: '#261732', direction: 'auto' },
  { name: 'feature', tipSha: 'feature-2', color: '#C58C75', direction: 'auto' },
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
    expect(bySha.get('feature-2')?.lane).toBe(-1);
    expect(layout.edges).toHaveLength(5);
  });

  it('ignores parents outside the fetched history', () => {
    const layout = computeGraphLayout([
      commit('merge', ['missing'], 5),
    ], [{ name: 'main', tipSha: 'merge', color: '#261732', direction: 'auto' }]);

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

  it('uses a horizontal curve when the graph is horizontal', () => {
    expect(generateEdgePath({
      from: 'a',
      to: 'b',
      fromX: 80,
      fromY: 50,
      toX: 180,
      toY: 120,
      color: '#000',
      type: 'branch',
    }, 'right')).toBe('M 80 50 C 130 50, 130 120, 180 120');
  });
});

describe('graph geometry', () => {
  it('keeps small graphs compact and large graphs readable', () => {
    const small = computeGraphLayout([
      commit('a', [], 1),
    ], [{ name: 'main', tipSha: 'a', color: '#261732', direction: 'auto' }]);
    const large = computeGraphLayout(Array.from({ length: 20 }, (_, index) => (
      commit(`commit-${index}`, index === 0 ? [] : [`commit-${index - 1}`], 20 - index)
    )), [{ name: 'main', tipSha: 'commit-0', color: '#261732', direction: 'auto' }]);

    expect(small.totalHeight).toBeLessThan(400);
    expect(large.totalHeight).toBeGreaterThan(small.totalHeight);
    expect(new Set(large.nodes.map(node => node.y)).size).toBe(20);
  });

  it('transposes the existing layout for horizontal viewing', () => {
    const down = computeGraphLayout([
      commit('merge', ['main', 'feature'], 3),
      commit('main', [], 2),
      commit('feature', [], 1),
    ], branches);
    const right = orientGraphLayout(down, 'right');

    expect(right.direction).toBe('right');
    expect(right.totalWidth).toBe(down.totalHeight);
    expect(right.totalHeight).toBe(down.totalWidth);
    expect(right.nodes[0].x).toBe(down.nodes[0].y);
    expect(right.nodes[0].y).toBe(down.nodes[0].x);
  });

  it('supports reverse vertical and horizontal directions', () => {
    const down = computeGraphLayout([
      commit('new', ['old'], 2),
      commit('old', [], 1),
    ], [{ name: 'main', tipSha: 'new', color: '#261732', direction: 'auto' }]);
    const up = orientGraphLayout(down, 'up');
    const left = orientGraphLayout(down, 'left');

    expect(up.nodes[0].y).toBe(down.totalHeight - down.nodes[0].y);
    expect(left.nodes[0].x).toBe(left.totalWidth - down.nodes[0].y);
    expect(left.nodes[0].y).toBe(down.nodes[0].x);
  });

  it('keeps the main branch in the center and respects manual sides', () => {
    const layout = computeGraphLayout([
      commit('main', [], 5),
      commit('left', [], 4),
      commit('right', [], 3),
    ], [
      { name: 'main', tipSha: 'main', color: '#261732', direction: 'auto' },
      { name: 'left', tipSha: 'left', color: '#3B82A8', direction: 'left' },
      { name: 'right', tipSha: 'right', color: '#B35D56', direction: 'right' },
    ]);

    const bySha = new Map(layout.nodes.map(node => [node.sha, node]));
    expect(bySha.get('main')?.lane).toBe(0);
    expect(bySha.get('left')?.lane).toBeLessThan(0);
    expect(bySha.get('right')?.lane).toBeGreaterThan(0);
    expect(new Set(layout.nodes.map(node => node.lane)).size).toBe(3);
  });
});
