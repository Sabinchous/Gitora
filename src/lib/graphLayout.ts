import { Branch, GitHubCommit } from '../types';

export interface GraphNode {
  sha: string;
  message: string;
  author: string;
  date: string;
  dateValue: string;
  parents: string[];
  lane: number;
  row: number;
  x: number;
  y: number;
  isMerge: boolean;
  branch: string;
}

export type GraphDirection = 'down' | 'up' | 'right' | 'left';

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
  direction: GraphDirection;
}

const LANE_WIDTH = 110;
const PADDING_X = 80;
const PADDING_Y = 50;
const MIN_GRAPH_WIDTH = 560;
const MIN_GRAPH_HEIGHT = 300;

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
      totalWidth: MIN_GRAPH_WIDTH,
      totalHeight: MIN_GRAPH_HEIGHT,
      direction: 'down',
    };
  }

  const commitBySha = new Map(commits.map(commit => [commit.sha, commit]));
  const defaultBranch = branches.find(branch => branch.name === 'main' || branch.name === 'master')
    ?? branches[0];
  const orderedBranches = defaultBranch
    ? [defaultBranch, ...branches.filter(branch => branch.name !== defaultBranch.name)]
    : branches;
  const branchColors = Object.fromEntries(branches.map(branch => [branch.name, branch.color]));
  const branchLane = new Map<string, number>();
  if (defaultBranch) branchLane.set(defaultBranch.name, 0);
  const occupiedLanes = new Set([0]);
  let autoLeftCount = 0;
  let autoRightCount = 0;
  const takeLane = (side: 'left' | 'right') => {
    const step = side === 'left' ? -1 : 1;
    let lane = step;
    while (occupiedLanes.has(lane)) lane += step;
    occupiedLanes.add(lane);
    return lane;
  };
  for (const branch of orderedBranches) {
    if (branch.name === defaultBranch?.name) continue;
    const preferredSide = branch.direction === 'left'
      ? 'left'
      : branch.direction === 'right'
        ? 'right'
        : autoLeftCount <= autoRightCount ? 'left' : 'right';
    const lane = takeLane(preferredSide);
    branchLane.set(branch.name, lane);
    if (lane < 0) autoLeftCount += 1;
    else autoRightCount += 1;
  }
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

  const rowHeight = commits.length <= 10 ? 56 : 64;
  const laneValues = orderedBranches.map((branch) => branchLane.get(branch.name) ?? 0);
  const minLane = Math.min(...laneValues, 0);
  const maxLane = Math.max(...laneValues, 0);
  const rawWidth = PADDING_X * 2 + (maxLane - minLane) * LANE_WIDTH;
  const rawHeight = PADDING_Y * 2 + Math.max(0, sorted.length - 1) * rowHeight;
  const totalWidth = Math.max(MIN_GRAPH_WIDTH, rawWidth);
  const totalHeight = Math.max(MIN_GRAPH_HEIGHT, rawHeight);
  const offsetX = (totalWidth - rawWidth) / 2;
  const offsetY = (totalHeight - rawHeight) / 2;

  const nodes = sorted.map((commit, row): GraphNode => {
    const branch = branchByCommit.get(commit.sha) ?? fallbackBranch;
    const lane = branchLane.get(branch) ?? 0;
    return {
      sha: commit.sha,
      message: commit.commit.message.split('\n')[0].slice(0, 48),
      author: commit.author?.login || commit.commit.author.name,
      date: new Date(commit.commit.author.date).toLocaleDateString('ru-RU'),
      dateValue: commit.commit.author.date,
      parents: commit.parents.map(parent => parent.sha),
      lane,
      row,
      x: offsetX + PADDING_X + (lane - minLane) * LANE_WIDTH,
      y: offsetY + PADDING_Y + row * rowHeight,
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

  return {
    nodes,
    edges,
    branchColors,
    totalWidth,
    totalHeight,
    direction: 'down',
  };
}

export function orientGraphLayout(layout: GraphLayoutResult, direction: GraphDirection): GraphLayoutResult {
  if (direction === 'down') return { ...layout, direction };
  if (direction === 'up') {
    return {
      ...layout,
      direction,
      nodes: layout.nodes.map(node => ({ ...node, y: layout.totalHeight - node.y })),
      edges: layout.edges.map(edge => ({
        ...edge,
        fromY: layout.totalHeight - edge.fromY,
        toY: layout.totalHeight - edge.toY,
      })),
    };
  }

  const horizontal = {
    ...layout,
    direction,
    nodes: layout.nodes.map(node => ({
      ...node,
      x: node.y,
      y: node.x,
    })),
    edges: layout.edges.map(edge => ({
      ...edge,
      fromX: edge.fromY,
      fromY: edge.fromX,
      toX: edge.toY,
      toY: edge.toX,
    })),
    totalWidth: layout.totalHeight,
    totalHeight: layout.totalWidth,
  };
  if (direction === 'right') return horizontal;

  return {
    ...horizontal,
    nodes: horizontal.nodes.map(node => ({ ...node, x: horizontal.totalWidth - node.x })),
    edges: horizontal.edges.map(edge => ({
      ...edge,
      fromX: horizontal.totalWidth - edge.fromX,
      toX: horizontal.totalWidth - edge.toX,
    })),
  };
}

export function generateEdgePath(edge: GraphEdge, direction: GraphDirection = 'down'): string {
  const { fromX, fromY, toX, toY } = edge;
  const isHorizontal = direction === 'right' || direction === 'left';
  if (!isHorizontal && fromX === toX) return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  if (isHorizontal && fromY === toY) return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  if (isHorizontal) {
    const middleX = fromX + (toX - fromX) / 2;
    return `M ${fromX} ${fromY} C ${middleX} ${fromY}, ${middleX} ${toY}, ${toX} ${toY}`;
  }
  const middleY = fromY + (toY - fromY) / 2;
  return `M ${fromX} ${fromY} C ${fromX} ${middleY}, ${toX} ${middleY}, ${toX} ${toY}`;
}
