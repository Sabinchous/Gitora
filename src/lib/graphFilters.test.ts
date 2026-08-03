import { describe, expect, it } from 'vitest';
import { Commit } from '../types';
import { GraphNode } from './graphLayout';
import {
  countActiveGraphFilters,
  EMPTY_GRAPH_FILTERS,
  filterGraphNodes,
  getMissingStatsShas,
} from './graphFilters';

const nodes: GraphNode[] = [
  { sha: 'merge', message: 'Merge', author: 'alice', date: '02.01.2026', dateValue: '2026-01-02T10:00:00Z', parents: ['a', 'b'], lane: 0, row: 0, x: 1, y: 1, isMerge: true, branch: 'main' },
  { sha: 'a', message: 'Feature', author: 'bob', date: '01.01.2026', dateValue: '2026-01-01T10:00:00Z', parents: ['base'], lane: 1, row: 1, x: 2, y: 2, isMerge: false, branch: 'feature' },
  { sha: 'base', message: 'Base', author: 'alice', date: '31.12.2025', dateValue: '2025-12-31T10:00:00Z', parents: [], lane: 0, row: 2, x: 1, y: 3, isMerge: false, branch: 'main' },
];

const commits: Commit[] = [
  { id: 'merge', x: 0, y: 0, lane: 0, row: 0, branch: 'main', label: 'Merge', author: 'alice', time: '02.01.2026', hash: 'merge', text: 'Merge', files: 2, plus: 3, minus: 1, changeStats: { files: 2, plus: 3, minus: 1 }, statsStatus: 'loaded', parents: ['a', 'b'] },
  { id: 'a', x: 0, y: 0, lane: 1, row: 1, branch: 'feature', label: 'Feature', author: 'bob', time: '01.01.2026', hash: 'a', text: 'Feature', files: 0, plus: 0, minus: 0, statsStatus: 'idle', parents: ['base'] },
  { id: 'base', x: 0, y: 0, lane: 0, row: 2, branch: 'main', label: 'Base', author: 'alice', time: '31.12.2025', hash: 'base', text: 'Base', files: 0, plus: 0, minus: 0, statsStatus: 'loaded', changeStats: { files: 0, plus: 0, minus: 0 }, parents: [] },
];

describe('graph filters', () => {
  it('combines merge, author, date and branch filters', () => {
    const result = filterGraphNodes(nodes, commits, {
      ...EMPTY_GRAPH_FILTERS,
      mergeOnly: true,
      author: 'alice',
      from: '2026-01-01',
      to: '2026-01-02',
      branch: 'main',
    });

    expect(result.map(node => node.sha)).toEqual(['merge']);
  });

  it('requires loaded file statistics for the files-only filter', () => {
    expect(filterGraphNodes(nodes, commits, { ...EMPTY_GRAPH_FILTERS, filesOnly: true }).map(node => node.sha))
      .toEqual(['merge']);
    expect(getMissingStatsShas(nodes, commits, true)).toEqual(['a']);
  });

  it('counts active filters and keeps empty filters at zero', () => {
    expect(countActiveGraphFilters(EMPTY_GRAPH_FILTERS)).toBe(0);
    expect(countActiveGraphFilters({ ...EMPTY_GRAPH_FILTERS, mergeOnly: true, author: 'alice' })).toBe(2);
  });
});
