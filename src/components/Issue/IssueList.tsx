import React, { useEffect, useState } from 'react';
import { CircleDot, Plus, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { GitHubIssue } from '../../types';
import { readableTextColor } from '../../lib/colors';

interface IssueListProps {
  owner: string;
  repo: string;
}

export const IssueList: React.FC<IssueListProps> = ({ owner, repo }) => {
  const { issues, loadIssues, setSelectedIssue, setIssueOpen, loading } = useApp();
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open');

  useEffect(() => {
    void loadIssues(owner, repo, filter);
  }, [owner, repo, filter]);

  const getStatusColor = (issue: GitHubIssue) => {
    return issue.state === 'open' ? 'bg-[#5D7659]' : 'bg-[#A16C62]';
  };

  const getStatusText = (issue: GitHubIssue) => {
    return issue.state === 'open' ? 'Открыта' : 'Закрыта';
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
          onClick={() => setIssueOpen(true)}
        >
          <Plus size={16} />
          Создать задачу
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#AEA989] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CircleDot size={40} className="text-[#7D7482] mb-4" />
            <p className="text-sm text-[#7D7482]">Нет задач</p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(38,23,50,.08)]">
            {issues.map((issue) => (
              <button
                key={issue.id}
                className="w-full p-4 text-left hover:bg-[#F3EFE9] transition-colors"
                onClick={() => setSelectedIssue(issue)}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-none ${getStatusColor(issue)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{issue.title}</span>
                      <span className="text-[10px] text-[#7D7482]">#{issue.number}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-[#7D7482]">
                      <span className="flex items-center gap-1">
                        <User size={12} />
                        {issue.user?.login || 'Неизвестный'}
                      </span>
                      <span>•</span>
                      <span>{getStatusText(issue)}</span>
                      <span>•</span>
                      <span>{new Date(issue.created_at).toLocaleDateString('ru-RU')}</span>
                    </div>
                    {issue.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {issue.labels.map((label) => (
                          <span
                            key={label.name}
                            className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                            style={{
                              backgroundColor: `#${label.color}`,
                              color: readableTextColor(label.color),
                            }}
                          >
                            {label.name}
                          </span>
                        ))}
                      </div>
                    )}
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
