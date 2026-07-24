import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { CommitNode } from './CommitNode';
import { generateEdgePath } from '../../lib/graphLayout';

export const Graph: React.FC = () => {
  const { commits, branches, branchFilter, selectedCommit, setSelectedCommit, graphLayout } = useApp();

  const filteredNodes = useMemo(() => {
    if (!graphLayout) return [];
    return branchFilter === 'all'
      ? graphLayout.nodes
      : graphLayout.nodes.filter(node => node.branch === branchFilter);
  }, [graphLayout, branchFilter]);

  const filteredEdges = useMemo(() => {
    if (!graphLayout) return [];
    if (branchFilter === 'all') return graphLayout.edges;
    const nodeBySha = new Map(graphLayout.nodes.map(node => [node.sha, node]));
    return graphLayout.edges.filter(edge =>
      nodeBySha.get(edge.from)?.branch === branchFilter
      || nodeBySha.get(edge.to)?.branch === branchFilter
    );
  }, [graphLayout, branchFilter]);

  const visibleBranches = useMemo(() => {
    if (branchFilter === 'all') return branches;
    return branches.filter(branch => branch.name === branchFilter);
  }, [branches, branchFilter]);

  if (!graphLayout || graphLayout.nodes.length === 0) {
    return (
      <div className="flex-1 h-full flex items-center justify-center min-w-0 bg-[var(--graph-bg)]">
        <p className="text-sm text-[#7D7482]">Нет данных для отображения</p>
      </div>
    );
  }

  const viewBoxWidth = graphLayout.totalWidth;
  const viewBoxHeight = graphLayout.totalHeight;

  return (
    <div className="flex-1 h-full min-w-0 bg-[var(--graph-bg)] relative" style={{ isolation: 'isolate' }}>
      <div
        className="relative"
        style={{
          width: '100%',
          height: '100%',
          minWidth: viewBoxWidth,
          minHeight: viewBoxHeight,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(var(--graph-dot) .75px, transparent .75px)',
            backgroundSize: '18px 18px',
            maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
          }}
        />

        <svg
          viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
          width={viewBoxWidth}
          height={viewBoxHeight}
          className="absolute inset-0 overflow-visible"
          aria-hidden="true"
        >
          {filteredEdges.map((edge, index) => (
            <path
              key={`${edge.from}-${edge.to}-${index}`}
              d={generateEdgePath(edge)}
              className="fill-none stroke-[3.5px] stroke-linecap-round opacity-95"
              stroke={edge.color}
              style={{ vectorEffect: 'non-scaling-stroke' }}
            />
          ))}
        </svg>

        {filteredNodes.map(node => (
          <CommitNode
            key={node.sha}
            commit={{
              id: node.sha,
              x: node.x,
              y: node.y,
              lane: node.lane,
              row: node.row,
              branch: node.branch,
              label: node.message,
              author: node.author,
              time: node.date,
              hash: node.sha.slice(0, 7),
              text: node.message,
              files: 0,
              plus: 0,
              minus: 0,
              merge: node.isMerge,
              current: node.row === 0,
              parents: node.parents,
            }}
            isSelected={selectedCommit?.id === node.sha}
            branchColor={graphLayout.branchColors[node.branch] || '#261732'}
            totalHeight={viewBoxHeight}
            onClick={() => {
              if (selectedCommit?.id === node.sha) {
                setSelectedCommit(null);
              } else {
                const fullCommit = commits.find(commit => commit.id === node.sha);
                if (fullCommit) setSelectedCommit(fullCommit);
              }
            }}
          />
        ))}

        {visibleBranches.map(branch => {
          const branchNode = graphLayout.nodes.find(node => node.branch === branch.name);
          if (!branchNode) return null;
          return (
            <div
              key={branch.name}
              className="absolute font-mono text-[8px] font-medium px-[7px] py-1 rounded bg-white border border-[rgba(38,23,50,.12)] shadow-sm flex items-center gap-1.5 whitespace-nowrap"
              style={{
                top: Math.max(20, branchNode.y - 25),
                left: branchNode.x,
              }}
            >
              <span className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: branch.color }} />
              {branch.name}
            </div>
          );
        })}

        <div className="absolute bottom-4 right-4 text-[9px] font-bold text-[#7D7482] tracking-wider">
          СЕЙЧАС
        </div>
      </div>
    </div>
  );
};
