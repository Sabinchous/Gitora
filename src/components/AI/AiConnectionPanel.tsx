import React, { useEffect, useState } from 'react';
import { AlertCircle, Bot, CheckCircle2, Clock3, Copy, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { McpWriteDuration } from '../../types';

const MCP_WRITE_OPTIONS: Array<{ duration: McpWriteDuration; label: string; description: string }> = [
  { duration: '10m', label: '10 минут', description: 'Для одной задачи' },
  { duration: '30m', label: '30 минут', description: 'Для короткой сессии' },
  { duration: '1h', label: '1 час', description: 'Для длительной работы' },
  { duration: 'forever', label: 'Бессрочно', description: 'До закрытия Gitora' },
];

function formatRemaining(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} с`;
  return `${minutes} мин ${String(seconds).padStart(2, '0')} с`;
}

export const AiConnectionPanel: React.FC = () => {
  const {
    aiStatus,
    allowMcpWrites,
    revokeMcpWrites,
    restartMcp,
    notify,
  } = useApp();
  const [connectionState, setConnectionState] = useState<'idle' | 'checking' | 'ready' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState('');
  const [writeAction, setWriteAction] = useState<McpWriteDuration | 'revoke' | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const checkConnection = async () => {
    setConnectionState('checking');
    setConnectionError('');
    try {
      const result = await restartMcp();
      const ready = Boolean(result?.mcpClient.connected || result?.tools.some(tool => tool.available));
      if (ready) {
        setConnectionState('ready');
        return;
      }
      const status = result || aiStatus;
      const reason = !status.mcpConfig.loaded
        ? 'Конфигурация MCP не загружена.'
        : !status.mcpRunning
          ? 'Локальный мост Gitora не отвечает.'
          : status.lastError || 'MCP-клиент не подключился за 30 секунд.';
      const fix = !status.mcpConfig.loaded
        ? 'Скопируйте готовую конфигурацию и добавьте её в настройки MCP-клиента.'
        : !status.mcpRunning
          ? 'Перезапустите Gitora и повторите проверку.'
          : 'Откройте новый чат или перезапустите MCP-клиент и повторите проверку.';
      setConnectionError(`${reason} Как исправить: ${fix}`);
      setConnectionState('error');
    } catch {
      setConnectionError('Не удалось проверить MCP. Проверьте, что Gitora и MCP-клиент запущены, затем повторите проверку.');
      setConnectionState('error');
    }
  };

  const copyText = async (value: string) => {
    const result = await window.electronAPI?.app.copyText(value);
    if (result?.success) {
      notify('Конфигурация скопирована');
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      notify('Конфигурация скопирована');
    } catch {
      notify('Не удалось скопировать конфигурацию');
    }
  };

  const template = aiStatus.configTemplate;
  const expiresAt = aiStatus.mcpWritesExpiresAt ? Date.parse(aiStatus.mcpWritesExpiresAt) : null;
  const writesActive = aiStatus.mcpWritesAllowed && (expiresAt === null || expiresAt > now);
  const remaining = writesActive && expiresAt !== null ? formatRemaining(expiresAt - now) : '';

  const grantWriteAccess = async (duration: McpWriteDuration) => {
    setWriteAction(duration);
    try {
      await allowMcpWrites(duration);
    } finally {
      setWriteAction(null);
    }
  };

  const revokeWriteAccess = async () => {
    setWriteAction('revoke');
    try {
      await revokeMcpWrites();
    } finally {
      setWriteAction(null);
    }
  };

  return (
    <section className="space-y-5" data-ai-connection-panel aria-labelledby="ai-connection-title">
      <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4" data-ai-client="universal">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[var(--ai-icon-bg)] text-[var(--ai-icon-ink)]">
            <Bot size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="ai-connection-title" className="text-base font-bold tracking-tight">MCP Gitora</h3>
            <p className="mt-1 max-w-[42ch] text-xs leading-relaxed text-[var(--muted)]">
              Подключите Gitora к Codex или другому ИИ с поддержкой MCP.
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          <p className="text-xs font-bold">Готовая MCP-конфигурация</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">Скопируйте блок и вставьте его в настройки MCP вашего ИИ-клиента.</p>
          <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--ink)]">{template}</pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="flex min-h-10 items-center gap-1.5 rounded-lg bg-[var(--ink)] px-3 text-xs font-semibold text-[var(--on-ink)] disabled:cursor-wait disabled:opacity-50"
              onClick={() => void copyText(template)}
              disabled={!template}
            >
              <Copy size={14} />
              Скопировать
            </button>
            <button
              type="button"
              className="flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--surface-soft)] disabled:cursor-wait disabled:opacity-50"
              onClick={() => void checkConnection()}
              disabled={connectionState === 'checking'}
            >
              {connectionState === 'checking' ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {connectionState === 'checking' ? 'Проверка подключения...' : 'Проверить подключение'}
            </button>
          </div>
          {connectionState === 'checking' && <p className="mt-3 text-xs font-semibold text-[#9A7D2F]" aria-live="polite">🟡 Проверка подключения...</p>}
          {connectionState === 'ready' && <p className="mt-3 text-xs font-semibold text-[#5D7659]" aria-live="polite">🟢 Подключено</p>}
          {connectionState === 'error' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[rgba(161,108,98,.12)] p-3 text-xs leading-relaxed text-[#A16C62]" aria-live="polite">
              <AlertCircle size={14} className="mt-0.5 flex-none" />
              <span>🔴 Ошибка: {connectionError}</span>
            </div>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3" data-mcp-write-controls>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-[var(--surface)] text-[var(--muted)]">
              <Clock3 size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold">Разрешение записи MCP</h4>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                Разрешает только изменения в GitHub через MCP. Чтение доступно всегда.
              </p>
            </div>
          </div>

          <div className={`mt-3 flex items-start gap-2 rounded-lg p-3 text-xs ${writesActive ? 'bg-[rgba(93,118,89,.12)] text-[#5D7659]' : 'bg-[var(--surface)] text-[var(--muted)]'}`} aria-live="polite">
            {writesActive ? <ShieldCheck size={15} className="mt-0.5 flex-none" /> : <ShieldOff size={15} className="mt-0.5 flex-none" />}
            <div>
              <p className="font-semibold">{writesActive ? 'Запись MCP разрешена' : 'Запись MCP запрещена'}</p>
              <p className="mt-0.5">
                {writesActive
                  ? expiresAt === null ? 'Бессрочно до закрытия Gitora' : `Осталось ${remaining}`
                  : 'Выберите срок действия ниже'}
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Срок разрешения записи MCP">
            {MCP_WRITE_OPTIONS.map(option => (
              <button
                key={option.duration}
                type="button"
                aria-pressed={writesActive && aiStatus.mcpWritesDuration === option.duration}
                className={`min-h-10 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-[background-color,color,transform,box-shadow] active:scale-[0.96] disabled:cursor-wait disabled:opacity-50 ${writesActive && aiStatus.mcpWritesDuration === option.duration ? 'border-[#5D7659] bg-[rgba(93,118,89,.12)] text-[#5D7659] shadow-sm' : 'border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-soft)]'}`}
                onClick={() => void grantWriteAccess(option.duration)}
                disabled={writeAction !== null}
              >
                <span className="block">{option.label}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-[var(--muted)]">{option.description}</span>
              </button>
            ))}
          </div>

          {writesActive && (
            <button
              type="button"
              className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-semibold text-[var(--ink)] transition-[background-color,color,transform] hover:bg-[var(--surface-soft)] active:scale-[0.96] disabled:cursor-wait disabled:opacity-50"
              onClick={() => void revokeWriteAccess()}
              disabled={writeAction !== null}
            >
              <ShieldOff size={14} />
              {writeAction === 'revoke' ? 'Отзываем разрешение…' : 'Отозвать разрешение'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
