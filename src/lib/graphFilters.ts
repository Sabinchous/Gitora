import { Commit } from '../types';
import { GraphNode } from './graphLayout';

export interface GraphFilters {
  mergeOnly: boolean;
  author: string;
  from: string;
  to: string;
  filesOnly: boolean;
  branch: string;
}

export const EMPTY_GRAPH_FILTERS: GraphFilters = {
  mergeOnly: false,
  author: '',
  from: '',
  to: '',
  filesOnly: false,
  branch: 'all',
};

function sameOrAfter(value: string, from: string): boolean {
  return !from || value.slice(0, 10) >= from;
}

function sameOrBefore(value: string, to: string): boolean {
  return !to || value.slice(0, 10) <= to;
}

export function filterGraphNodes(
  nodes: GraphNode[],
  commits: Commit[],
  filters: GraphFilters,
): GraphNode[] {
  const commitBySha = new Map(commits.map(commit => [commit.id, commit]));

  return nodes.filter(node => {
    const commit = commitBySha.get(node.sha);
    if (filters.mergeOnly && !node.isMerge) return false;
    if (filters.author && node.author !== filters.author) return false;
    if (!sameOrAfter(node.dateValue, filters.from) || !sameOrBefore(node.dateValue, filters.to)) return false;
    if (filters.filesOnly && (commit?.statsStatus !== 'loaded' || commit.files <= 0)) return false;
    if (filters.branch !== 'all' && node.branch !== filters.branch) return false;
    return true;
  });
}

export function getMissingStatsShas(nodes: GraphNode[], commits: Commit[], filesOnly: boolean): string[] {
  if (!filesOnly) return [];
  const commitBySha = new Map(commits.map(commit => [commit.id, commit]));
  return nodes
    .filter(node => commitBySha.get(node.sha)?.statsStatus !== 'loaded')
    .map(node => node.sha);
}

export function getGraphAuthors(nodes: GraphNode[]): string[] {
  return [...new Set(nodes.map(node => node.author).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));
}

export function countActiveGraphFilters(filters: GraphFilters): number {
  return [
    filters.mergeOnly,
    Boolean(filters.author),
    Boolean(filters.from),
    Boolean(filters.to),
    filters.filesOnly,
    filters.branch !== 'all',
  ].filter(Boolean).length;
}
