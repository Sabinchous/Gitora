import React, { useEffect } from 'react';
import { Copy, Download, ExternalLink, GitBranch, GitCommitHorizontal, Github, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const DetailPanel: React.FC = () => {
  const { selectedCommit, setSelectedCommit, notify, project, openExternal, downloadArchive } = useApp();

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedCommit(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [setSelectedCommit]);

  if (!selectedCommit) return null;

  const fullMessage = selectedCommit.text || selectedCommit.label;
  const shortMessage = fullMessage.split('\n')[0];

  const copyHash = async () => {
    await navigator.clipboard.writeText(selectedCommit.id);
    notify('Хеш скопирован');
  };

  return (
    <aside
      className="fixed md:sticky inset-x-0 bottom-0 h-[68vh] md:h-fit md:max-h-[calc(100vh-74px)] md:w-[294px] flex-none border border-b-0 md:border-y-0 md:border-l border-[rgba(38,23,50,.12)] bg-white rounded-t-2xl md:rounded-none z-30 md:z-auto shadow-lg md:shadow-none overflow-auto md:top-[66px] md:self-start"
      aria-label="Детали коммита"
    >
      <div className="sticky top-0 h-[48px] bg-white border-b border-[rgba(38,23,50,.12)] flex items-center justify-between px-4 text-[9px] font-extrabold tracking-wider text-[#7D7482] z-10">
        <span>ДЕТАЛИ КОММИТА</span>
        <button className="w-8 h-8 grid place-items-center" aria-label="Закрыть детали" onClick={() => setSelectedCommit(null)}>
          <X size={18} />
        </button>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2 text-[8px] font-extrabold tracking-wider text-[#7D7482]">
          <span className="w-[25px] h-[25px] rounded-lg bg-[#E7E0D6] grid place-items-center text-[#261732]">
            <GitCommitHorizontal size={16} />
          </span>
          КОММИТ
        </div>

        <h2 className="text-lg font-semibold tracking-tight mt-3 mb-1 leading-tight break-words">{shortMessage}</h2>
        {fullMessage !== shortMessage && (
          <p className="text-[11px] text-[#7D7482] leading-relaxed mb-2 whitespace-pre-line break-words">{fullMessage}</p>
        )}

        <div className="flex items-center gap-2.5 mt-3">
          <span className="w-[30px] h-[30px] rounded-full bg-[#AEA989] text-[10px] font-extrabold grid place-items-center flex-none">
            {selectedCommit.author[0]?.toUpperCase() || '?'}
          </span>
          <div className="min-w-0">
            <b className="block text-[10px] truncate">{selectedCommit.author}</b>
            <small className="block text-[8px] text-[#7D7482] mt-0.5">{selectedCommit.time}</small>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <div className="bg-[#F3EFE9] rounded-lg p-2 min-w-0">
            <small className="text-[7px] tracking-wider text-[#7D7482] block mb-1.5">ВЕТКА</small>
            <b className="text-[9px] flex items-center gap-1">
              <GitBranch size={14} />
              <span className="truncate">{selectedCommit.branch}</span>
            </b>
          </div>
          <div className="bg-[#F3EFE9] rounded-lg p-2">
            <small className="text-[7px] tracking-wider text-[#7D7482] block mb-1.5">ХЕШ</small>
            <button className="text-[9px] flex items-center gap-1" onClick={() => void copyHash()}>
              <code className="font-mono">{selectedCommit.hash}</code>
              <Copy size={13} />
            </button>
          </div>
        </div>

        {selectedCommit.merge && (
          <div className="mt-3 p-2 bg-[rgba(174,169,137,.12)] rounded-lg flex items-center gap-2">
            <span className="w-[5px] h-[5px] rounded-full bg-[#8E7CA3]" />
            <span className="text-[9px] text-[#7D7482]">Слияние веток</span>
          </div>
        )}

        {project && (
          <>
            <button
              className="w-full mt-4 p-2.5 bg-[#261732] text-[#E7E0D6] rounded-lg text-[10px] font-semibold flex items-center justify-center gap-2 hover:bg-[#1a1024]"
              onClick={() => {
                const [owner, repo] = project.repo.split('/');
                void downloadArchive(owner, repo, selectedCommit.id);
              }}
            >
              <Download size={15} />
              Скачать эту версию
            </button>
            <button
              className="w-full mt-2 p-2.5 border border-[rgba(38,23,50,.12)] rounded-lg text-[10px] font-semibold flex items-center justify-center gap-2"
              onClick={() => void openExternal(`https://github.com/${project.repo}/commit/${selectedCommit.id}`)}
            >
              <Github size={17} />
              Открыть на GitHub
              <ExternalLink size={14} />
            </button>
          </>
        )}
      </div>
    </aside>
  );
};
