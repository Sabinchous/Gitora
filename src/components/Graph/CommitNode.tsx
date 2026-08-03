import React from 'react';
import { GitMerge } from 'lucide-react';
import { GraphNode } from '../../lib/graphLayout';

interface CommitNodeProps {
  commit: GraphNode;
  isSelected: boolean;
  isHead: boolean;
  branchColor: string;
  onClick: (sha: string) => void;
}

const CommitNodeComponent: React.FC<CommitNodeProps> = ({
  commit,
  isSelected,
  isHead,
  branchColor,
  onClick,
}) => (
  <button
    className={`absolute grid place-items-center cursor-pointer rounded-full ${isSelected || commit.isMerge ? 'w-9 h-9' : 'w-8 h-8'} ${isSelected ? 'z-10' : 'z-[1]'}`}
    style={{
      left: commit.x,
      top: commit.y,
      transform: 'translate(-50%, -50%)',
    }}
    onClick={() => onClick(commit.sha)}
    aria-label={`${commit.message}, ${commit.author}, ${commit.date}${commit.isMerge ? ', merge-коммит' : ''}`}
    title={commit.message}
  >
    {isHead && <span className="absolute inset-0 rounded-full border-2 border-[var(--sage)] opacity-85" aria-label="HEAD" />}
    <span
      className={`relative grid place-items-center rounded-full border-2 border-[var(--graph-node-ring)] transition-transform ${commit.isMerge ? 'h-6 w-6 shadow-[0_0_0_3px_rgba(142,124,163,.24)]' : 'h-4 w-4'} ${isSelected ? 'scale-125 shadow-lg' : 'hover:scale-125'}`}
      style={{ backgroundColor: branchColor, color: '#261732' }}
    >
      {commit.isMerge && <GitMerge size={12} strokeWidth={2.5} aria-hidden="true" />}
    </span>
  </button>
);

export const CommitNode = React.memo(CommitNodeComponent);
