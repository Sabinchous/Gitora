import React from 'react';
import { ExternalLink, GitPullRequest, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { GitHubPR } from '../../types';

export const PRDetail: React.FC = () => {
  const { selectedPR, setSelectedPR, openExternal } = useApp();

  if (!selectedPR) return null;

  const getStatusColor = (pr: GitHubPR) => {
    if (pr.merged) return 'bg-[#8E7CA3]';
    if (pr.state === 'closed') return 'bg-[#A16C62]';
    return 'bg-[#5D7659]';
  };

  const getStatusText = (pr: GitHubPR) => {
    if (pr.merged) return 'Слияно';
    if (pr.state === 'closed') return 'Закрыт';
    return 'Открыт';
  };

  return (
    <div className="w-[340px] flex-none border-l border-[rgba(38,23,50,.12)] bg-white h-full overflow-auto">
      <div className="sticky top-0 bg-white border-b border-[rgba(38,23,50,.12)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitPullRequest size={16} className="text-[#7D7482]" />
          <span className="text-sm font-semibold">PR #{selectedPR.number}</span>
        </div>
        <button
          className="w-7 h-7 rounded grid place-items-center text-[#7D7482] hover:text-[#261732] hover:bg-[#F3EFE9]"
          onClick={() => setSelectedPR(null)}
          aria-label="Закрыть"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4">
        <h2 className="text-lg font-semibold mb-2">{selectedPR.title}</h2>
        
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-2 h-2 rounded-full ${getStatusColor(selectedPR)}`} />
          <span className="text-xs text-[#7D7482]">{getStatusText(selectedPR)}</span>
          <span className="text-xs text-[#7D7482]">•</span>
          <span className="text-xs text-[#7D7482]">
            {new Date(selectedPR.created_at).toLocaleDateString('ru-RU')}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-4 text-xs">
          <span className="px-2 py-1 bg-[rgba(93,118,89,.1)] text-[#5D7659] rounded">{selectedPR.head.ref}</span>
          <span className="text-[#7D7482]">→</span>
          <span className="px-2 py-1 bg-[rgba(38,23,50,.08)] text-[#261732] rounded">{selectedPR.base.ref}</span>
        </div>

        {selectedPR.user && (
          <div className="flex items-center gap-2 mb-4 text-xs text-[#7D7482]">
            <img
              src={selectedPR.user.avatar_url}
              alt=""
              className="w-5 h-5 rounded-full"
            />
            <span>{selectedPR.user.login}</span>
          </div>
        )}

        {selectedPR.body && (
          <div className="p-3 bg-[#F3EFE9] rounded-lg text-sm whitespace-pre-wrap mb-4">
            {selectedPR.body}
          </div>
        )}

        <button
          className="w-full h-10 bg-[#261732] text-[#E7E0D6] rounded-lg flex items-center justify-center gap-2 text-sm font-semibold"
          onClick={() => void openExternal(selectedPR.html_url)}
        >
          <ExternalLink size={16} />
          Открыть на GitHub
        </button>
      </div>
    </div>
  );
};