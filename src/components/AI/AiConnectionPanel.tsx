import React, { useState } from 'react';
import { AlertCircle, Bot, CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export const AiConnectionPanel: React.FC = () => {
  const {
    aiStatus,
    restartMcp,
    notify,
  } = useApp();
  const [connectionState, setConnectionState] = useState<'idle' | 'checking' | 'ready' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState('');

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
      </div>
    </section>
  );
};
