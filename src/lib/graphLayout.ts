import { Branch, GitHubCommit } from '../types';

export interface GraphNode {
  sha: string;
  message: string;
  author: string;
  date: string;
  parents: string[];
  lane: number;
  row: number;
  x: number;
  y: number;
  isMerge: boolean;
  branch: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  type: 'normal' | 'branch' | 'merge';
}

export interface GraphLayoutResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  branchColors: Record<string, string>;
  totalWidth: number;
  totalHeight: number;
}

const LANE_WIDTH = 110;
const ROW_HEIGHT = 64;
const PADDING_X = 80;
const PADDING_Y = 50;

function ancestorsFrom(tipSha: string, commits: Map<string, GitHubCommit>) {
  const found = new Set<string>();
  const pending = [tipSha];

  while (pending.length) {
    const sha = pending.pop();
    if (!sha || found.has(sha)) continue;
    const commit = commits.get(sha);
    if (!commit) continue;
    found.add(sha);
    for (const parent of commit.parents) pending.push(parent.sha);
  }

  return found;
}

function firstParentLine(tipSha: string, commits: Map<string, GitHubCommit>) {
  const found = new Set<string>();
  let current = tipSha;
  while (current && !found.has(current)) {
    const commit = commits.get(current);
    if (!commit) break;
    found.add(current);
    current = commit.parents[0]?.sha;
  }
  return found;
}

export function computeGraphLayout(
  commits: GitHubCommit[],
  branches: Branch[],
): GraphLayoutResult {
  if (!commits.length) {
    return {
      nodes: [],
      edges: [],
      branchColors: {},
      totalWidth: PADDING_X * 2,
      totalHeight: PADDING_Y * 2,
    };
  }

  const commitBySha = new Map(commits.map(commit => [commit.sha, commit]));
  const defaultBranch = branches.find(branch => branch.name === 'main' || branch.name === 'master')
    ?? branches[0];
  const orderedBranches = defaultBranch
    ? [defaultBranch, ...branches.filter(branch => branch.name !== defaultBranch.name)]
    : branches;
  const branchColors = Object.fromEntries(branches.map(branch => [branch.name, branch.color]));
  const branchLane = new Map(orderedBranches.map((branch, index) => [branch.name, index]));
  const branchByCommit = new Map<string, string>();

  if (defaultBranch) {
    for (const sha of firstParentLine(defaultBranch.tipSha, commitBySha)) {
      branchByCommit.set(sha, defaultBranch.name);
    }
  }

  for (const branch of orderedBranches) {
    if (branch.name === defaultBranch?.name) continue;
    for (const sha of ancestorsFrom(branch.tipSha, commitBySha)) {
      if (!branchByCommit.has(sha)) branchByCommit.set(sha, branch.name);
    }
  }

  const fallbackBranch = defaultBranch?.name ?? 'main';
  const sorted = [...commits].sort(
    (a, b) => Date.parse(b.commit.author.date) - Date.parse(a.commit.author.date),
  );

  const nodes = sorted.map((commit, row): GraphNode => {
    const branch = branchByCommit.get(commit.sha) ?? fallbackBranch;
    const lane = branchLane.get(branch) ?? 0;
    return {
      sha: commit.sha,
      message: commit.commit.message.split('\n')[0].slice(0, 48),
      author: commit.author?.login || commit.commit.author.name,
      date: new Date(commit.commit.author.date).toLocaleDateString('ru-RU'),
      parents: commit.parents.map(parent => parent.sha),
      lane,
      row,
      x: PADDING_X + lane * LANE_WIDTH,
      y: PADDING_Y + row * ROW_HEIGHT,
      isMerge: commit.parents.length > 1,
      branch,
    };
  });

  const nodeBySha = new Map(nodes.map(node => [node.sha, node]));
  const edges: GraphEdge[] = [];

  for (const node of nodes) {
    for (const parentSha of node.parents) {
      const parent = nodeBySha.get(parentSha);
      if (!parent) continue;
      const sameLane = node.lane === parent.lane;
      edges.push({
        from: node.sha,
        to: parent.sha,
        fromX: node.x,
        fromY: node.y,
        toX: parent.x,
        toY: parent.y,
        color: branchColors[node.branch] ?? '#261732',
        type: node.isMerge && !sameLane ? 'merge' : sameLane ? 'normal' : 'branch',
      });
    }
  }

  const maxLane = Math.max(...nodes.map(node => node.lane), 0);
  return {
    nodes,
    edges,
    branchColors,
    totalWidth: Math.max(800, PADDING_X * 2 + maxLane * LANE_WIDTH),
    totalHeight: Math.max(400, PADDING_Y * 2 + (nodes.length - 1) * ROW_HEIGHT),
  };
}

export function generateEdgePath(edge: GraphEdge): string {
  const { fromX, fromY, toX, toY } = edge;
  if (fromX === toX) return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  const middleY = fromY + (toY - fromY) / 2;
  return `M ${fromX} ${fromY} C ${fromX} ${middleY}, ${toX} ${middleY}, ${toX} ${toY}`;
}
