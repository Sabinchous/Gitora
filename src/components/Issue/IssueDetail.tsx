import React from 'react';
import { CircleDot, ExternalLink, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { GitHubIssue } from '../../types';
import { readableTextColor } from '../../lib/colors';

export const IssueDetail: React.FC = () => {
  const { selectedIssue, setSelectedIssue, openExternal } = useApp();

  if (!selectedIssue) return null;

  const getStatusColor = (issue: GitHubIssue) => {
    return issue.state === 'open' ? 'bg-[#5D7659]' : 'bg-[#A16C62]';
  };

  const getStatusText = (issue: GitHubIssue) => {
    return issue.state === 'open' ? 'Открыта' : 'Закрыта';
  };

  return (
    <div className="w-[340px] flex-none border-l border-[rgba(38,23,50,.12)] bg-white h-full overflow-auto">
      <div className="sticky top-0 bg-white border-b border-[rgba(38,23,50,.12)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CircleDot size={16} className="text-[#7D7482]" />
          <span className="text-sm font-semibold">Задача #{selectedIssue.number}</span>
        </div>
        <button
          className="w-7 h-7 rounded grid place-items-center text-[#7D7482] hover:text-[#261732] hover:bg-[#F3EFE9]"
          onClick={() => setSelectedIssue(null)}
          aria-label="Закрыть"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4">
        <h2 className="text-lg font-semibold mb-2">{selectedIssue.title}</h2>
        
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-2 h-2 rounded-full ${getStatusColor(selectedIssue)}`} />
          <span className="text-xs text-[#7D7482]">{getStatusText(selectedIssue)}</span>
          <span className="text-xs text-[#7D7482]">•</span>
          <span className="text-xs text-[#7D7482]">
            {new Date(selectedIssue.created_at).toLocaleDateString('ru-RU')}
          </span>
        </div>

        {selectedIssue.user && (
          <div className="flex items-center gap-2 mb-4 text-xs text-[#7D7482]">
            <img
              src={selectedIssue.user.avatar_url}
              alt=""
              className="w-5 h-5 rounded-full"
            />
            <span>{selectedIssue.user.login}</span>
          </div>
        )}

        {selectedIssue.labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {selectedIssue.labels.map((label) => (
              <span
                key={label.name}
                className="px-2 py-1 rounded text-[10px] font-medium"
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

        {selectedIssue.assignees.length > 0 && (
          <div className="mb-4">
            <span className="text-[10px] font-bold text-[#7D7482] mb-2 block">НАЗНАЧЕНО</span>
            <div className="flex flex-wrap gap-2">
              {selectedIssue.assignees.map((assignee) => (
                <div key={assignee.login} className="flex items-center gap-1.5 px-2 py-1 bg-[#F3EFE9] rounded text-xs">
                  <img src={assignee.avatar_url} alt="" className="w-4 h-4 rounded-full" />
                  <span>{assignee.login}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedIssue.body && (
          <div className="p-3 bg-[#F3EFE9] rounded-lg text-sm whitespace-pre-wrap mb-4">
            {selectedIssue.body}
          </div>
        )}

        <button
          className="w-full h-10 bg-[#261732] text-[#E7E0D6] rounded-lg flex items-center justify-center gap-2 text-sm font-semibold"
          onClick={() => void openExternal(selectedIssue.html_url)}
        >
          <ExternalLink size={16} />
          Открыть на GitHub
        </button>
      </div>
    </div>
  );
};
