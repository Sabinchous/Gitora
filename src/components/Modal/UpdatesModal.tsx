import React, { useState } from 'react';
import { Download, ExternalLink, Package, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export const UpdatesModal: React.FC = () => {
  const {
    updatesOpen,
    setUpdatesOpen,
    releases,
    currentVersion,
    downloadRelease,
    notify,
  } = useApp();
  const [closing, setClosing] = useState(false);

  if (!updatesOpen) return null;

  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setUpdatesOpen(false);
      setClosing(false);
    }, 150);
  };

  const handleDownload = async (url: string, fileName: string) => {
    const filePath = await downloadRelease(url, fileName);
    if (filePath) {
      notify(`Файл сохранён: ${filePath}`);
    }
  };

  return (
    <div
      className="modal-overlay fixed inset-0 backdrop-blur-sm grid place-items-center z-50 p-4"
      data-closing={closing}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal-panel w-[min(560px,100%)] max-h-[80vh] rounded-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(38,23,50,.12)]">
          <div className="flex items-center gap-3">
            <Package size={20} className="text-[#261732]" />
            <div>
              <h2 className="text-lg font-bold">Обновления</h2>
              <p className="text-[10px] text-[#7D7482]">Текущая версия: {currentVersion}</p>
            </div>
          </div>
          <button
            className="w-8 h-8 grid place-items-center rounded-lg hover:bg-[#F3EFE9]"
            onClick={close}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {releases.length === 0 ? (
            <p className="text-sm text-[#7D7482] text-center py-8">
              Загрузка списка версий...
            </p>
          ) : (
            releases.map((release) => {
              const exeAsset = release.assets.find(a => a.name.endsWith('.exe'));
              const isCurrentVersion = release.tag === `v${currentVersion}` || release.tag === currentVersion;

              return (
                <div
                  key={release.tag}
                  className={`border rounded-xl p-4 ${isCurrentVersion ? 'border-[#AEA989] bg-[#F7F3EE]' : 'border-[rgba(38,23,50,.12)]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm">{release.name || release.tag}</h3>
                        {isCurrentVersion && (
                          <span className="text-[9px] font-bold bg-[#AEA989] text-[#261732] px-2 py-0.5 rounded-full">
                            ТЕКУЩАЯ
                          </span>
                        )}
                        {release.prerelease && (
                          <span className="text-[9px] font-bold bg-[#C58C75] text-[#261732] px-2 py-0.5 rounded-full">
                            ПРЕРЕЛИЗ
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#7D7482] mt-1">
                        {formatDate(release.publishedAt)}
                      </p>
                      {release.body && (
                        <p className="text-[11px] text-[#261732] mt-2 whitespace-pre-line leading-relaxed">
                          {release.body}
                        </p>
                      )}
                    </div>
                  </div>

                  {exeAsset && (
                    <div className="mt-3 flex items-center gap-3 pt-3 border-t border-[rgba(38,23,50,.08)]">
                      <span className="text-[10px] text-[#7D7482]">
                        {exeAsset.name} ({formatSize(exeAsset.size)})
                      </span>
                      <button
                        className="ml-auto h-8 px-4 bg-[#261732] text-[#E7E0D6] rounded-lg text-[11px] font-semibold flex items-center gap-1.5 hover:bg-[#1a1024]"
                        onClick={() => handleDownload(exeAsset.downloadUrl, exeAsset.name)}
                      >
                        <Download size={14} />
                        Скачать
                      </button>
                    </div>
                  )}

                  {!exeAsset && release.assets.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[rgba(38,23,50,.08)]">
                      <p className="text-[10px] text-[#7D7482] mb-2">Доступные файлы:</p>
                      <div className="flex flex-wrap gap-2">
                        {release.assets.map(asset => (
                          <button
                            key={asset.name}
                            className="h-7 px-3 border border-[rgba(38,23,50,.12)] rounded-lg text-[10px] font-medium flex items-center gap-1 hover:bg-[#F3EFE9]"
                            onClick={() => handleDownload(asset.downloadUrl, asset.name)}
                          >
                            <Download size={12} />
                            {asset.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-[rgba(38,23,50,.12)]">
          <button
            className="w-full h-10 border border-[rgba(38,23,50,.12)] rounded-lg text-[11px] font-semibold flex items-center justify-center gap-2 hover:bg-[#F3EFE9]"
            onClick={() => window.open('https://github.com/Appappars/Gitora/releases', '_blank')}
          >
            <ExternalLink size={14} />
            Все релизы на GitHub
          </button>
        </div>
      </div>
    </div>
  );
};
