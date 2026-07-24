import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Calendar, Search, User, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { GitHubCommit } from '../../types';

interface SearchBarProps {
  owner: string;
  repo: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ owner, repo }) => {
  const { searchCommits } = useApp();
  const [query, setQuery] = useState('');
  const [author, setAuthor] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [results, setResults] = useState<GitHubCommit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);

  const handleSearch = useCallback(async () => {
    if (!query.trim() && !author.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const commits = await searchCommits(
        owner,
        repo,
        query.trim(),
        author.trim() || undefined,
        since || undefined,
        until || undefined
      );
      setResults(commits);
    } finally {
      setIsSearching(false);
    }
  }, [owner, repo, query, author, since, until, searchCommits]);

  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      void handleSearch();
    }, 300);
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [query, author, since, until]);

  const clearSearch = () => {
    setQuery('');
    setAuthor('');
    setSince('');
    setUntil('');
    setResults([]);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7D7482]" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск коммитов..."
            className="focus-surface w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-white rounded-lg pl-10 pr-10 text-sm"
          />
          {(query || author || since || until) && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7D7482] hover:text-[#261732]"
              onClick={clearSearch}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <button
          className={`h-[42px] px-3 border rounded-lg flex items-center gap-2 text-xs font-semibold ${showFilters ? 'bg-[#261732] text-[#E7E0D6] border-[#261732]' : 'border-[rgba(38,23,50,.12)] bg-white'}`}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Calendar size={14} />
          Фильтры
        </button>
      </div>

      {showFilters && (
        <div className="mt-2 p-3 bg-[#F3EFE9] rounded-lg flex flex-wrap gap-3">
          <label className="flex-1 min-w-[150px]">
            <span className="text-[10px] font-bold text-[#7D7482] block mb-1">Автор</span>
            <div className="relative">
              <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7D7482]" />
              <input
                type="text"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="username"
                className="focus-surface w-full h-[34px] border border-[rgba(38,23,50,.12)] bg-white rounded-lg pl-8 pr-3 text-xs"
              />
            </div>
          </label>
          <label className="flex-1 min-w-[120px]">
            <span className="text-[10px] font-bold text-[#7D7482] block mb-1">С даты</span>
            <input
              type="date"
              value={since}
              onChange={(event) => setSince(event.target.value)}
              className="focus-surface w-full h-[34px] border border-[rgba(38,23,50,.12)] bg-white rounded-lg px-3 text-xs"
            />
          </label>
          <label className="flex-1 min-w-[120px]">
            <span className="text-[10px] font-bold text-[#7D7482] block mb-1">По дату</span>
            <input
              type="date"
              value={until}
              onChange={(event) => setUntil(event.target.value)}
              className="focus-surface w-full h-[34px] border border-[rgba(38,23,50,.12)] bg-white rounded-lg px-3 text-xs"
            />
          </label>
        </div>
      )}

      {results.length > 0 && (
        <div className="absolute left-0 right-0 mt-2 bg-white border border-[rgba(38,23,50,.12)] rounded-lg shadow-lg z-20 max-h-[300px] overflow-auto">
          <div className="px-3 py-2 border-b border-[rgba(38,23,50,.08)] text-[10px] text-[#7D7482] font-semibold">
            Найдено: {results.length}
          </div>
          {results.map((commit) => (
            <div
              key={commit.sha}
              className="px-3 py-2 hover:bg-[#F3EFE9] border-b border-[rgba(38,23,50,.08)] last:border-0"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#7D7482]">{commit.sha.slice(0, 7)}</span>
                <span className="text-xs truncate flex-1">{commit.commit.message.split('\n')[0]}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-[#7D7482]">
                <span>{commit.commit.author.name}</span>
                <span>•</span>
                <span>{new Date(commit.commit.author.date).toLocaleDateString('ru-RU')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {isSearching && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-[#AEA989] border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};
