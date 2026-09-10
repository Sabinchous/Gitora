import React, { useEffect, useRef, useState } from 'react';
import { Play, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

function launchFileStorageKey(owner: string, repo: string): string {
  return `gitora.launchFile.${owner}/${repo}`;
}

function readStoredLaunchFile(owner: string, repo: string): string {
  try {
    return localStorage.getItem(launchFileStorageKey(owner, repo)) || '';
  } catch {
    return '';
  }
}

export const SessionStartModal: React.FC<{ onStarted?: () => void }> = ({ onStarted }) => {
  const { launchTarget, setLaunchTarget, startSession, detection, detecting, detectSessionTarget } = useApp();
  const [launchFile, setLaunchFile] = useState('');
  const [command, setCommand] = useState('');
  const [memoryMb, setMemoryMb] = useState(4096);
  const [maxAgeMinutes, setMaxAgeMinutes] = useState(240);
  const [networking, setNetworking] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const targetKey = launchTarget ? `${launchTarget.owner}/${launchTarget.repo}@${launchTarget.sha}` : '';

  useEffect(() => {
    if (busyRef.current) return;
    if (launchTarget) {
      setLaunchFile(readStoredLaunchFile(launchTarget.owner, launchTarget.repo));
      setCommand('');
      setMemoryMb(4096);
      setMaxAgeMinutes(240);
      setNetworking(true);
      setBusy(false);
      setSubmitError(null);
      void detectSessionTarget(launchTarget.owner, launchTarget.repo, launchTarget.sha);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  const detectionKey = detection
    ? `${detection.kind}:${detection.command || ''}:${detection.launchFile || ''}:${detection.packagePath || ''}`
    : '';
  useEffect(() => {
    if (!detection || !launchTarget) return;
    if (detection.kind === 'node' || detection.kind === 'python') {
      setCommand(detection.command || '');
    } else if (detection.kind === 'dotnet' && detection.launchFile) {
      setLaunchFile(prev => prev.trim() ? prev : detection.launchFile as string);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectionKey]);

  useEffect(() => {
    if (!launchTarget) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setLaunchTarget(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [busy, setLaunchTarget, launchTarget]);

  if (!launchTarget) return null;

  const trimmedLaunchFile = launchFile.trim();
  const trimmedCommand = command.trim();
  const validMemory = Number.isInteger(memoryMb) && memoryMb >= 1024 && memoryMb <= 32768;
  const validAge = Number.isInteger(maxAgeMinutes) && maxAgeMinutes >= 5 && maxAgeMinutes <= 1440;
  const isCommandMode = detection?.kind === 'node' || detection?.kind === 'python';
  const canStart = (isCommandMode ? trimmedCommand.length > 0 : trimmedLaunchFile.length > 0)
    && validMemory && validAge && !busy;

  const runtimeLabel = !detection
    ? null
    : detection.kind === 'node'
      ? `Node.js${detection.electron ? ' + Electron' : ''}${detection.packagePath ? ` · ${detection.packagePath}` : ''}`
      : detection.kind === 'python'
        ? `Python${detection.entry ? ` · ${detection.entry}` : ''}${detection.packageDir ? ` (${detection.packageDir})` : ''}`
        : detection.kind === 'dotnet'
          ? `.NET · ${detection.launchFile}`
          : null;

  const close = () => {
    if (!busy) setLaunchTarget(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canStart || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      if (!isCommandMode) {
        try {
          localStorage.setItem(launchFileStorageKey(launchTarget.owner, launchTarget.repo), trimmedLaunchFile);
        } catch {
          // localStorage недоступен — запуск продолжаем без сохранения префилла.
        }
      }
      const started = await startSession(isCommandMode
        ? {
          owner: launchTarget.owner,
          repo: launchTarget.repo,
          sha: launchTarget.sha,
          runtime: detection?.kind === 'python' ? 'python' : 'node',
          launchCommand: trimmedCommand,
          packageDir: detection?.packageDir,
          buildFirst: detection?.buildFirst,
          memoryMb,
          maxAgeMinutes,
          networking,
        }
        : {
          owner: launchTarget.owner,
          repo: launchTarget.repo,
          sha: launchTarget.sha,
          runtime: 'dotnet',
          launchFile: trimmedLaunchFile,
          memoryMb,
          maxAgeMinutes,
          networking,
        });
      if (started) {
        setLaunchTarget(null);
        onStarted?.();
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Не удалось запустить сессию');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-[rgba(38,23,50,.58)] backdrop-blur-sm grid place-items-center z-50 p-3 sm:p-5"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        className="w-[min(520px,100%)] max-h-[calc(100vh-24px)] overflow-auto bg-white rounded-2xl p-6 sm:p-7 relative shadow-[0_18px_50px_rgba(38,23,50,.13)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-start-title"
      >
        <button className="absolute right-4 top-4 w-8 h-8 grid place-items-center disabled:opacity-40" aria-label="Закрыть" disabled={busy} onClick={close}>
          <X size={19} />
        </button>
        <div className="w-[47px] h-[47px] rounded-[13px] bg-[#E7E0D6] grid place-items-center">
          <Play size={25} />
        </div>
        <h2 id="session-start-title" className="text-[23px] font-semibold mt-4 mb-1">Запустить версию</h2>
        <p className="text-xs text-[#7D7482] leading-relaxed mb-5">
          <b className="text-[#261732]">{`${launchTarget.owner}/${launchTarget.repo}`}</b>
          {' @ '}
          <span className="font-mono">{launchTarget.sha.slice(0, 7)}</span>
        </p>

        <form onSubmit={(event) => void handleSubmit(event)}>
          {detecting ? (
            <p role="status" className="mb-4 text-xs text-[#7D7482]">Определяю рантайм…</p>
          ) : runtimeLabel ? (
            <p className="mb-4 text-xs text-[#7D7482]">Обнаружено: <b className="text-[#261732]">{runtimeLabel}</b></p>
          ) : (
            <p className="mb-4 text-xs text-[#7D7482]">Рантайм не распознан — укажите файл или команду вручную</p>
          )}
          {isCommandMode ? (
            <label className="block text-xs font-bold">
              Команда запуска
              <input
                autoFocus
                value={command}
                disabled={busy}
                onChange={(event) => setCommand(event.target.value)}
                placeholder="npx electron ."
                spellCheck={false}
                autoComplete="off"
                className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2 font-mono"
              />
            </label>
          ) : (
          <label className="block text-xs font-bold">
            Файл запуска
            <input
              autoFocus
              value={launchFile}
              disabled={busy}
              onChange={(event) => setLaunchFile(event.target.value)}
              placeholder="src/App/App.csproj"
              className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
            />
          </label>
          )}
          {!isCommandMode && !trimmedLaunchFile ? (
            <p className="mt-2 text-xs text-[#7D7482]">Укажите .csproj для запуска или .sln для сборки</p>
          ) : null}
          {isCommandMode && !trimmedCommand ? (
            <p className="mt-2 text-xs text-[#7D7482]">Укажите одну команду без &amp; | &gt; &lt; и подстановок</p>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <label className="block text-xs font-bold">
              Память, МБ
              <input
                type="number"
                min={1024}
                max={32768}
                step={512}
                value={memoryMb}
                disabled={busy}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setMemoryMb(Number.isFinite(next) ? Math.trunc(next) : 0);
                }}
                className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
              />
            </label>

            <label className="block text-xs font-bold">
              Лимит, минут
              <input
                type="number"
                min={5}
                max={1440}
                step={5}
                value={maxAgeMinutes}
                disabled={busy}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setMaxAgeMinutes(Number.isFinite(next) ? Math.trunc(next) : 0);
                }}
                className="block w-full h-[42px] border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] rounded-lg px-3 text-sm mt-2"
              />
            </label>
          </div>

          <div className="mt-4">
            <label className="min-h-[42px] border border-[rgba(38,23,50,.12)] rounded-lg px-3 flex items-center gap-2 text-xs font-bold">
              <input
                type="checkbox"
                checked={networking}
                disabled={busy}
                onChange={(event) => setNetworking(event.target.checked)}
              />
              Сеть в песочнице
            </label>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-6">
            <button type="button" disabled={busy} className="px-4 py-2 border border-[rgba(38,23,50,.12)] rounded-lg text-sm font-semibold disabled:opacity-40" onClick={close}>
              Отмена
            </button>
            <button
              type="submit"
              disabled={!canStart}
              className="px-4 py-2 bg-[#261732] text-[#E7E0D6] rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Play size={16} />
              Запустить
            </button>
          </div>
          {submitError ? (
            <p role="alert" className="mt-3 rounded-lg border border-[rgba(161,108,98,.28)] bg-[rgba(161,108,98,.09)] px-3 py-2 text-xs text-[#A16C62]">
              {submitError}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  );
};
