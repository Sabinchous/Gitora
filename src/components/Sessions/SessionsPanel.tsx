import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import type { CommitSessionState } from '../../types';

const SESSION_STATE_LABEL: Record<CommitSessionState, string> = {
  starting: 'Запуск',
  running: 'Работает',
  stopping: 'Останавливается',
  gone: 'Завершена',
};

function sessionStateBadgeClass(state: CommitSessionState): string {
  switch (state) {
    case 'running':
      return 'bg-[rgba(93,118,89,.12)] text-[#5D7659]';
    case 'starting':
      return 'bg-[rgba(174,169,137,.18)] text-[#6B6543]';
    case 'stopping':
      return 'bg-[rgba(197,140,117,.15)] text-[#A16C62]';
    case 'gone':
    default:
      return 'bg-[rgba(38,23,50,.08)] text-[#7D7482]';
  }
}

export const SessionsPanel: React.FC = () => {
  const {
    project,
    sessions,
    sessionsLoading,
    sessionsError,
    sessionLogById,
    sessionLogLoading,
    loadSessions,
    stopSession,
    loadSessionLog,
  } = useApp();
  const [openLogId, setOpenLogId] = useState<string | null>(null);

  useEffect(() => {
    void loadSessions();
    const timer = window.setInterval(() => {
      void loadSessions();
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [loadSessions]);

  const toggleLog = (id: string) => {
    if (openLogId === id) {
      setOpenLogId(null);
      return;
    }
    setOpenLogId(id);
    void loadSessionLog(id);
  };

  // Sessions are global to the backend; show only the current project's so
  // different repos never mix. With no project selected, show nothing.
  const visibleSessions = project
    ? sessions.filter(session => `${session.owner}/${session.repo}` === project.repo)
    : [];

  return (
    <div className="h-full flex flex-col">
      {sessionsError ? (
        <p role="alert" className="mx-4 mt-3 rounded-lg border border-[rgba(161,108,98,.28)] bg-[rgba(161,108,98,.09)] px-3 py-2 text-xs text-[#A16C62]">
          {sessionsError}
        </p>
      ) : null}
      <div className="flex-1 overflow-auto" data-sessions-list>
        {visibleSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <p className="text-sm text-[#7D7482]" role="status">
              {sessionsLoading
                ? 'Загрузка…'
                : 'Нет запущенных сессий. Выберите коммит и нажмите «Запустить эту версию».'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[rgba(38,23,50,.08)]">
            {visibleSessions.map((session) => {
              const logOpen = openLogId === session.id;
              const logText = sessionLogById[session.id]?.log;
              return (
                <div key={session.id} className="p-4" data-session-row={session.id}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{`${session.owner}/${session.repo}`}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold flex-none ${sessionStateBadgeClass(session.state)}`}>
                      {SESSION_STATE_LABEL[session.state]}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[#7D7482]">
                    <span className="font-mono">{session.sha.slice(0, 7)}</span>
                    <span className="mx-1">•</span>
                    <span className="break-all">{session.launchFile}</span>
                  </div>
                  <div className="mt-1 text-xs text-[#7D7482]">
                    <span>{new Date(session.createdAt).toLocaleString('ru-RU')}</span>
                    {session.expiresAt ? (
                      <>
                        <span className="mx-1">•</span>
                        <span>до {new Date(session.expiresAt).toLocaleString('ru-RU')}</span>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {session.state !== 'gone' ? (
                      <button
                        type="button"
                        disabled={sessionsLoading}
                        aria-label={`Остановить сессию ${session.sha.slice(0, 7)}`}
                        onClick={() => void stopSession(session.id)}
                        className="rounded-lg border border-[rgba(38,23,50,.12)] px-3 py-1.5 text-xs font-semibold hover:bg-[#F3EFE9] disabled:opacity-40"
                      >
                        Остановить
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-expanded={logOpen}
                      aria-controls={`session-log-${session.id}`}
                      onClick={() => toggleLog(session.id)}
                      className="rounded-lg border border-[rgba(38,23,50,.12)] px-3 py-1.5 text-xs font-semibold hover:bg-[#F3EFE9]"
                    >
                      Лог
                    </button>
                    {logOpen ? (
                      <button
                        type="button"
                        disabled={sessionLogLoading}
                        onClick={() => void loadSessionLog(session.id)}
                        className="rounded-lg border border-[rgba(38,23,50,.12)] px-3 py-1.5 text-xs font-semibold hover:bg-[#F3EFE9] disabled:opacity-40"
                      >
                        Обновить лог
                      </button>
                    ) : null}
                  </div>
                    {logOpen ? (
                      <pre id={`session-log-${session.id}`} role="log" className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[rgba(38,23,50,.12)] bg-[#F3EFE9] p-3 text-xs leading-relaxed">
                        {logText || (sessionLogLoading ? 'Загрузка…' : '')}
                      </pre>
                    ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
