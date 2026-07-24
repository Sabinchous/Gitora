import React, { useEffect, useState } from 'react';
import { GitPullRequest, Plus, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { GitHubPR } from '../../types';

interface PRListProps {
  owner: string;
  repo: string;
}

export const PRList: React.FC<PRListProps> = ({ owner, repo }) => {
  const { pullRequests, loadPullRequests, setSelectedPR, setPrOpen, loading } = useApp();
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open');

  useEffect(() => {
    void loadPullRequests(owner, repo, filter);
  }, [owner, repo, filter]);

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
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[rgba(38,23,50,.12)]">
        <div className="flex gap-2">
          {(['open', 'closed', 'all'] as const).map((state) => (
            <button
              key={state}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === state ? 'bg-[#261732] text-[#E7E0D6]' : 'border border-[rgba(38,23,50,.12)]'}`}
              onClick={() => setFilter(state)}
            >
              {state === 'open' ? 'Открытые' : state === 'closed' ? 'Закрытые' : 'Все'}
            </button>
          ))}
        </div>
        <button
          className="h-[34px] bg-[#261732] text-[#E7E0D6] rounded-lg flex items-center gap-2 px-3 text-[11px] font-semibold"
          onClick={() => setPrOpen(true)}
        >
          <Plus size={16} />
          Создать PR
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#AEA989] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : pullRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <GitPullRequest size={40} className="text-[#7D7482] mb-4" />
            <p className="text-sm text-[#7D7482]">Нет pull requests</p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(38,23,50,.08)]">
            {pullRequests.map((pr) => (
              <button
                key={pr.id}
                className="w-full p-4 text-left hover:bg-[#F3EFE9] transition-colors"
                onClick={() => setSelectedPR(pr)}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-none ${getStatusColor(pr)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{pr.title}</span>
                      <span className="text-[10px] text-[#7D7482]">#{pr.number}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-[#7D7482]">
                      <span className="flex items-center gap-1">
                        <User size={12} />
                        {pr.user?.login || 'Неизвестный'}
                      </span>
                      <span>•</span>
                      <span>{getStatusText(pr)}</span>
                      <span>•</span>
                      <span>{new Date(pr.created_at).toLocaleDateString('ru-RU')}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                      <span className="px-1.5 py-0.5 bg-[rgba(93,118,89,.1)] text-[#5D7659] rounded">{pr.head.ref}</span>
                      <span className="text-[#7D7482]">→</span>
                      <span className="px-1.5 py-0.5 bg-[rgba(38,23,50,.08)] text-[#261732] rounded">{pr.base.ref}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};