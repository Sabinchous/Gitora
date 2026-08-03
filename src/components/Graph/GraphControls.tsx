import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowRight,
  Crosshair,
  FileDiff,
  Filter,
  GitBranch,
  GitMerge,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Branch } from '../../types';
import { GraphDirection } from '../../lib/graphLayout';
import { GraphFilters } from '../../lib/graphFilters';
import { SelectMenu } from '../common/SelectMenu';

interface GraphControlsProps {
  zoom: number;
  direction: GraphDirection;
  filters: GraphFilters;
  branches: Branch[];
  authors: string[];
  activeFilterCount: number;
  statsLoading: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenter: () => void;
  onDirectionChange: (direction: GraphDirection) => void;
  onFiltersChange: (changes: Partial<GraphFilters>) => void;
  onClearFilters: () => void;
}

const controlButton = 'grid h-10 w-10 place-items-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--ink)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35';
const selectClass = 'h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-xs text-[var(--ink)] outline-none focus:border-[var(--sage)]';
const HIDE_DELAY_MS = 5000;

export const GraphControls: React.FC<GraphControlsProps> = ({
  zoom,
  direction,
  filters,
  branches,
  authors,
  activeFilterCount,
  statsLoading,
  onZoomIn,
  onZoomOut,
  onCenter,
  onDirectionChange,
  onFiltersChange,
  onClearFilters,
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const activeLabels = [
    filters.mergeOnly ? 'merge' : '',
    filters.filesOnly ? 'с файлами' : '',
    filters.author ? `автор: ${filters.author}` : '',
    filters.from ? `от ${filters.from}` : '',
    filters.to ? `до ${filters.to}` : '',
    filters.branch !== 'all' ? `ветка: ${filters.branch}` : '',
  ].filter(Boolean);

  const cancelHide = () => {
    if (hideTimer.current !== undefined) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = undefined;
    }
    setRevealed(true);
  };

  const scheduleHide = () => {
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setRevealed(false);
      setFiltersOpen(false);
      hideTimer.current = undefined;
    }, HIDE_DELAY_MS);
  };

  useEffect(() => () => {
    if (hideTimer.current !== undefined) window.clearTimeout(hideTimer.current);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-44" data-graph-control>
      <div
        className="pointer-events-auto absolute left-0 top-0 h-32 w-9"
        aria-hidden="true"
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
      />
      <div
        className={`pointer-events-auto absolute left-3 top-3 flex max-w-[calc(100%-24px)] flex-col items-start gap-2 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${revealed ? 'translate-x-0 opacity-100' : '-translate-x-4 pointer-events-none opacity-0'}`}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
        onFocusCapture={cancelHide}
        onBlurCapture={scheduleHide}
      >
      <div className="flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)]/95 p-1.5 shadow-[var(--shadow-border)] backdrop-blur-sm" data-graph-control>
        <button type="button" className={controlButton} onClick={onZoomOut} disabled={zoom <= 0.4} aria-label="Уменьшить масштаб" title="Уменьшить масштаб">
          <ZoomOut size={15} />
        </button>
        <span data-graph-zoom className="min-w-[42px] text-center text-xs font-bold tabular-nums text-[var(--ink)]" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" className={controlButton} onClick={onZoomIn} disabled={zoom >= 2} aria-label="Увеличить масштаб" title="Увеличить масштаб">
          <ZoomIn size={15} />
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--line)]" aria-hidden="true" />
        <button type="button" className={`${controlButton} w-auto gap-1.5 px-2`} onClick={onCenter} title="Подогнать и центрировать граф">
          <Crosshair size={15} />
          <span className="hidden sm:inline text-xs font-semibold">По центру</span>
        </button>
        <span className="mx-1 h-5 w-px bg-[var(--line)]" aria-hidden="true" />
        <div className="flex items-center rounded-lg bg-[var(--surface-soft)] p-0.5" role="group" aria-label="Направление графа">
          <button
            type="button"
            className={`grid h-10 w-10 place-items-center rounded-md transition-colors active:scale-[0.96] ${direction === 'down' ? 'bg-[var(--surface-strong)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
            aria-label="Граф сверху вниз"
            aria-pressed={direction === 'down'}
            onClick={() => onDirectionChange('down')}
            title="Сверху вниз"
          >
            <ArrowDown size={15} />
          </button>
          <button
            type="button"
            className={`grid h-10 w-10 place-items-center rounded-md transition-colors active:scale-[0.96] ${direction === 'up' ? 'bg-[var(--surface-strong)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
            aria-label="Граф снизу вверх"
            aria-pressed={direction === 'up'}
            onClick={() => onDirectionChange('up')}
            title="Снизу вверх"
          >
            <ArrowUp size={15} />
          </button>
          <button
            type="button"
            className={`grid h-10 w-10 place-items-center rounded-md transition-colors active:scale-[0.96] ${direction === 'right' ? 'bg-[var(--surface-strong)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
            aria-label="Граф слева направо"
            aria-pressed={direction === 'right'}
            onClick={() => onDirectionChange('right')}
            title="Слева направо"
          >
            <ArrowRight size={15} />
          </button>
          <button
            type="button"
            className={`grid h-10 w-10 place-items-center rounded-md transition-colors active:scale-[0.96] ${direction === 'left' ? 'bg-[var(--surface-strong)] text-[var(--ink)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}
            aria-label="Граф справа налево"
            aria-pressed={direction === 'left'}
            onClick={() => onDirectionChange('left')}
            title="Справа налево"
          >
            <ArrowLeft size={15} />
          </button>
        </div>
        <button
          type="button"
          className={`${controlButton} relative w-auto gap-1.5 px-2 ${filtersOpen || activeFilterCount ? 'bg-[var(--surface-strong)] text-[var(--ink)]' : ''}`}
          onClick={() => setFiltersOpen(current => !current)}
          aria-expanded={filtersOpen}
          aria-controls="graph-filters"
          title="Фильтры графа"
        >
          <Filter size={14} />
          <span className="hidden sm:inline text-xs font-semibold">Фильтры</span>
          {activeFilterCount > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[var(--sage)] px-1 text-xs font-bold text-[var(--ink)]">{activeFilterCount}</span>}
        </button>
      </div>

      {filtersOpen && (
        <div id="graph-filters" className="pointer-events-auto grid w-[min(640px,calc(100vw-32px))] gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)]/96 p-3 shadow-[var(--shadow-border)] backdrop-blur-sm sm:grid-cols-2 lg:grid-cols-3" data-graph-control>
          {activeLabels.length > 0 && (
            <div className="flex flex-wrap gap-1 sm:col-span-2 lg:col-span-3" aria-label="Активные фильтры">
              {activeLabels.map(label => <span key={label} className="rounded-md bg-[var(--surface-strong)] px-2 py-1 text-xs font-semibold text-[var(--ink)]">{label}</span>)}
            </div>
          )}
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
            <input
              type="checkbox"
              checked={filters.mergeOnly}
              onChange={event => onFiltersChange({ mergeOnly: event.target.checked })}
              className="accent-[var(--branch-violet)]"
            />
            <GitMerge size={14} className="text-[var(--branch-violet)]" />
            Только merge-коммиты
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
            <input
              type="checkbox"
              checked={filters.filesOnly}
              onChange={event => onFiltersChange({ filesOnly: event.target.checked })}
              className="accent-[var(--branch-coral)]"
            />
            <FileDiff size={14} className="text-[var(--branch-coral)]" />
            С изменениями файлов
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink)]">
            <GitBranch size={14} className="text-[var(--muted)]" />
            <span className="sr-only">Фильтр ветки</span>
            <SelectMenu
              value={filters.branch}
              onChange={value => onFiltersChange({ branch: value })}
              options={[{ value: 'all', label: 'Все ветки' }, ...branches.map(branch => ({ value: branch.name, label: branch.name }))]}
              ariaLabel="Фильтр ветки"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--ink)]">
            Автор
            <SelectMenu
              value={filters.author}
              onChange={value => onFiltersChange({ author: value })}
              options={[{ value: '', label: 'Все авторы' }, ...authors.map(author => ({ value: author, label: author }))]}
              ariaLabel="Фильтр автора"
              className="mt-1"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--ink)]">
            От даты
            <input type="date" value={filters.from} onChange={event => onFiltersChange({ from: event.target.value })} className={`${selectClass} mt-1`} aria-label="Дата от" />
          </label>
          <label className="text-xs font-semibold text-[var(--ink)]">
            До даты
            <input type="date" value={filters.to} onChange={event => onFiltersChange({ to: event.target.value })} className={`${selectClass} mt-1`} aria-label="Дата до" />
          </label>
          <div className="flex items-end justify-between gap-2 sm:col-span-2 lg:col-span-3">
            {statsLoading ? <span className="text-xs text-[var(--muted)]">Загружаю статистику изменений…</span> : <span />}
            {activeFilterCount > 0 && (
              <button type="button" className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]" onClick={onClearFilters}>
                <X size={13} />
                Очистить
              </button>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
