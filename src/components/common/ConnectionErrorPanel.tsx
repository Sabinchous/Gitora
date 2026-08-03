import React from 'react';
import { AlertCircle, KeyRound, RefreshCw, ShieldAlert, WifiOff } from 'lucide-react';
import { ConnectionErrorInfo } from '../../lib/connectionErrors';

interface ConnectionErrorPanelProps {
  error: ConnectionErrorInfo;
  onAction: () => void;
  onSecondaryAction?: () => void;
  compact?: boolean;
}

function ErrorIcon({ kind }: { kind: ConnectionErrorInfo['kind'] }) {
  if (kind === 'network') return <WifiOff size={21} />;
  if (kind === 'permissions') return <ShieldAlert size={21} />;
  if (kind === 'auth' || kind === 'session') return <KeyRound size={21} />;
  return <AlertCircle size={21} />;
}

export const ConnectionErrorPanel: React.FC<ConnectionErrorPanelProps> = ({
  error,
  onAction,
  onSecondaryAction,
  compact = false,
}) => (
  <section
    className={`rounded-xl border border-[rgba(161,108,98,.28)] bg-[rgba(161,108,98,.09)] text-[var(--ink)] ${compact ? 'p-3' : 'p-5'}`}
    role="alert"
  >
    <div className="flex items-start gap-3">
      <span className="w-9 h-9 rounded-lg bg-[rgba(161,108,98,.14)] text-[#A16C62] grid place-items-center flex-none">
        <ErrorIcon kind={error.kind} />
      </span>
      <div className="min-w-0">
        <h3 className={`font-semibold ${compact ? 'text-sm' : 'text-base'}`}>{error.title}</h3>
        <p className="text-xs text-[var(--muted)] leading-relaxed mt-1">{error.description}</p>
      </div>
    </div>
    <div className="flex flex-wrap gap-2 mt-4">
      <button
        type="button"
        className="h-9 px-3 bg-[var(--ink)] text-[var(--on-ink)] rounded-lg text-xs font-semibold flex items-center gap-2"
        onClick={onAction}
      >
        {error.actionKind === 'retry' && <RefreshCw size={14} />}
        {error.action}
      </button>
      {onSecondaryAction && (
        <button
          type="button"
          className="h-9 px-3 border border-[var(--line)] bg-[var(--surface)] rounded-lg text-xs font-semibold"
          onClick={onSecondaryAction}
        >
          Войти с токеном
        </button>
      )}
    </div>
  </section>
);
