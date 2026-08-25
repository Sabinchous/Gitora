import React, { useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { displayVersion, getLatestStableRelease, isNewerVersion } from '../../lib/version';

const DISMISSED_UPDATE_KEY = 'gitora-dismissed-update';

function readDismissedTag(): string {
  try {
    return localStorage.getItem(DISMISSED_UPDATE_KEY) || '';
  } catch {
    return '';
  }
}

export const UpdateNotice: React.FC = () => {
  const { releases, currentVersion, setUpdatesOpen } = useApp();
  const latestRelease = useMemo(() => getLatestStableRelease(releases), [releases]);
  const [dismissedTag, setDismissedTag] = useState(readDismissedTag);

  if (!latestRelease || !isNewerVersion(latestRelease.tag, currentVersion) || dismissedTag === latestRelease.tag) {
    return null;
  }

  const dismiss = () => {
    setDismissedTag(latestRelease.tag);
    try {
      localStorage.setItem(DISMISSED_UPDATE_KEY, latestRelease.tag);
    } catch {
      // Уведомление всё равно можно скрыть до перезагрузки приложения.
    }
  };

  const openUpdates = () => {
    setUpdatesOpen(true);
    dismiss();
  };

  return (
    <section
      className="mx-3 mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow-border)] sm:mx-6 sm:mt-4 sm:p-4"
      role="status"
      aria-live="polite"
      aria-label="Доступно обновление Gitora"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-lg bg-[var(--selection-bg)] text-[var(--selection-ink)]">
          <Download size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Доступна новая версия Gitora</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            Версия {displayVersion(latestRelease.tag)} уже вышла. Сейчас установлена {displayVersion(currentVersion)}.
          </p>
        </div>
        <button
          type="button"
          className="grid h-8 w-8 flex-none place-items-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
          onClick={dismiss}
          aria-label="Скрыть уведомление об обновлении"
          title="Скрыть уведомление"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 pl-12 sm:pl-12">
        <button
          type="button"
          className="h-9 rounded-lg bg-[var(--ink)] px-3 text-xs font-semibold text-[var(--on-ink)] transition-colors hover:opacity-90"
          onClick={openUpdates}
        >
          Открыть обновления
        </button>
        <button
          type="button"
          className="h-9 rounded-lg px-3 text-xs font-semibold text-[var(--muted)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]"
          onClick={dismiss}
        >
          Позже
        </button>
      </div>
    </section>
  );
};
