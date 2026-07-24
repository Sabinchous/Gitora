import React from 'react';
import { GitMerge } from 'lucide-react';
import { Commit } from '../../types';

interface CommitNodeProps {
  commit: Commit;
  isSelected: boolean;
  branchColor: string;
  totalHeight: number;
  onClick: () => void;
}

export const CommitNode: React.FC<CommitNodeProps> = ({
  commit,
  isSelected,
  branchColor,
  totalHeight,
  onClick,
}) => {
  const topPercent = (commit.y / totalHeight) * 100;

  return (
    <button
      className={`absolute w-7 h-7 rounded-full grid place-items-center cursor-pointer ${isSelected ? 'z-10' : 'z-[1]'}`}
      style={{
        left: commit.x,
        top: commit.y,
        transform: 'translate(-50%, -50%)',
      }}
      onClick={onClick}
      aria-label={`${commit.label}, ${commit.author}, ${commit.time}`}
    >
      <span
        className={`w-4 h-4 rounded-full border-2 border-[var(--graph-node-ring)] grid place-items-center transition-transform ${isSelected ? 'scale-125 shadow-lg' : 'hover:scale-125'}`}
        style={{ backgroundColor: branchColor, color: '#261732' }}
      >
        {commit.merge && <GitMerge size={11} />}
      </span>

      {isSelected && (
        <span
          className={`absolute px-3 py-2 rounded-lg border border-[rgba(38,23,50,.12)] bg-white shadow-md z-20 min-w-[160px] max-w-[220px] pointer-events-none text-left ${
            topPercent > 70 ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
          style={{ left: '50%', transform: 'translateX(-50%)' }}
        >
          <b className="block text-[11px] text-[#261732] break-words">{commit.label}</b>
          <small className="block text-[8px] text-[#7D7482] mt-0.5">{commit.author} · {commit.time}</small>
          <small className="block text-[8px] text-[#AEA989] mt-0.5 font-mono">{commit.hash}</small>
        </span>
      )}
    </button>
  );
};
