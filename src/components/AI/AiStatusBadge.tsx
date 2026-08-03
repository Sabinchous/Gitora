import React from 'react';
import { AlertTriangle, Bot, CheckCircle2, Circle, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AiConnectionLevel } from '../../types';

function StatusIcon({ level }: { level: AiConnectionLevel }) {
  if (level === 'ready') return <CheckCircle2 size={14} />;
  if (level === 'attention') return <AlertTriangle size={14} />;
  if (level === 'error') return <XCircle size={14} />;
  return <Circle size={14} />;
}

export const AiStatusBadge: React.FC = () => {
  const { aiStatus, setAiOpen } = useApp();
  const tone = aiStatus.level === 'ready'
    ? 'text-[#5D7659] bg-[rgba(93,118,89,.1)]'
    : aiStatus.level === 'error'
      ? 'text-[#A16C62] bg-[rgba(161,108,98,.1)]'
      : aiStatus.level === 'attention'
        ? 'text-[#9A7D2F] bg-[rgba(154,125,47,.11)]'
        : 'text-[var(--muted)] bg-[var(--surface-soft)]';

  return (
    <button
      type="button"
      className={`flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors hover:opacity-80 ${tone}`}
      onClick={() => setAiOpen(true)}
      title="Состояние подключения к ИИ"
      aria-label={`Состояние подключения к ИИ: ${aiStatus.label}`}
      data-ai-status
    >
      <Bot size={14} />
      <StatusIcon level={aiStatus.level} />
      <span className="hidden max-w-[150px] truncate sm:inline">{aiStatus.label}</span>
    </button>
  );
};
