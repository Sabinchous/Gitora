import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, GitMerge } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { filterGraphNodes, getGraphAuthors, getMissingStatsShas, GraphFilters, EMPTY_GRAPH_FILTERS } from '../../lib/graphFilters';
import { generateEdgePath, orientGraphLayout } from '../../lib/graphLayout';
import { clampGraphZoom, readGraphViewPreferences, saveGraphViewPreferences } from '../../lib/graphView';
import { CommitNode } from './CommitNode';
import { GraphControls } from './GraphControls';

interface PanPosition {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  panX: number;
  panY: number;
}

export const Graph: React.FC = () => {
  const {
    commits,
    branches,
    branchFilter,
    setBranchFilter,
    selectedCommit,
    setSelectedCommit,
    graphLayout,
    commitStatsLoading,
    loadCommitDetails,
    project,
    repositoryEmpty,
    setReadmeOpen,
  } = useApp();
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const previousProjectId = useRef<string | null>(project?.id ?? null);
  const previousFitKey = useRef('');
  const [viewPreferences, setViewPreferences] = useState(() => readGraphViewPreferences(project?.id ?? 'default'));
  const [pan, setPan] = useState<PanPosition>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [filters, setFilters] = useState<GraphFilters>({ ...EMPTY_GRAPH_FILTERS, branch: branchFilter });

  const direction = viewPreferences.direction;
  const zoom = viewPreferences.zoom;
  const orientedLayout = useMemo(
    () => graphLayout ? orientGraphLayout(graphLayout, direction) : null,
    [graphLayout, direction],
  );

  const updateViewPreferences = useCallback((changes: Partial<typeof viewPreferences>) => {
    setViewPreferences(current => ({ ...current, ...changes }));
  }, []);

  useEffect(() => {
    if (!project || project.id === previousProjectId.current) return;
    previousProjectId.current = project.id;
    setViewPreferences(readGraphViewPreferences(project.id));
    setFilters({ ...EMPTY_GRAPH_FILTERS, branch: 'all' });
    setPan({ x: 0, y: 0 });
    previousFitKey.current = '';
  }, [project]);

  useEffect(() => {
    if (project) saveGraphViewPreferences(project.id, viewPreferences);
  }, [project, viewPreferences]);

  useEffect(() => {
    setFilters(current => current.branch === branchFilter ? current : { ...current, branch: branchFilter });
  }, [branchFilter]);

  const visibleNodes = useMemo(() => {
    if (!orientedLayout) return [];
    return filterGraphNodes(orientedLayout.nodes, commits, filters);
  }, [orientedLayout, commits, filters]);

  const statsCandidateNodes = useMemo(() => {
    if (!orientedLayout) return [];
    return filterGraphNodes(orientedLayout.nodes, commits, { ...filters, filesOnly: false });
  }, [orientedLayout, commits, filters]);

  const missingStatsShas = useMemo(
    () => getMissingStatsShas(statsCandidateNodes, commits, filters.filesOnly),
    [statsCandidateNodes, commits, filters.filesOnly],
  );
  const missingStatsKey = missingStatsShas.join('|');

  useEffect(() => {
    if (!filters.filesOnly || !missingStatsShas.length) return;
    void loadCommitDetails(missingStatsShas);
  }, [filters.filesOnly, missingStatsKey]);

  const filteredEdges = useMemo(() => {
    if (!orientedLayout) return [];
    const visibleShas = new Set(visibleNodes.map(node => node.sha));
    return orientedLayout.edges.filter(edge => visibleShas.has(edge.from) && visibleShas.has(edge.to));
  }, [orientedLayout, visibleNodes]);

  const authors = useMemo(() => getGraphAuthors(orientedLayout?.nodes ?? []), [orientedLayout]);
  const headShas = useMemo(() => new Set(branches.map(branch => branch.tipSha)), [branches]);
  const defaultBranchName = useMemo(
    () => orientedLayout?.nodes.find(node => node.row === 0)?.branch ?? branches[0]?.name,
    [orientedLayout, branches],
  );
  const activeFilterCount = useMemo(() => [
    filters.mergeOnly,
    Boolean(filters.author),
    Boolean(filters.from),
    Boolean(filters.to),
    filters.filesOnly,
    filters.branch !== 'all',
  ].filter(Boolean).length, [filters]);

  const fitView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !orientedLayout) return;
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    if (!width || !height) return;

    const boundsNodes = visibleNodes.length ? visibleNodes : orientedLayout.nodes;
    const minX = Math.min(...boundsNodes.map(node => node.x)) - 60;
    const maxX = Math.max(...boundsNodes.map(node => node.x)) + 60;
    const minY = Math.min(...boundsNodes.map(node => node.y)) - 60;
    const maxY = Math.max(...boundsNodes.map(node => node.y)) + 60;
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const fittedZoom = clampGraphZoom(Math.min(1.4, Math.min((width - 48) / contentWidth, (height - 48) / contentHeight)));

    setViewPreferences(current => ({ ...current, zoom: fittedZoom }));
    setPan({
      x: (width - contentWidth * fittedZoom) / 2 - minX * fittedZoom,
      y: (height - contentHeight * fittedZoom) / 2 - minY * fittedZoom,
    });
  }, [orientedLayout, visibleNodes, setViewPreferences]);

  const fitContentKey = filters.filesOnly && missingStatsShas.length > 0 ? 'stats-pending' : String(visibleNodes.length);
  const fitKey = `${project?.id ?? 'none'}:${direction}:${graphLayout?.nodes.length ?? 0}:${fitContentKey}:${filters.mergeOnly}:${filters.author}:${filters.from}:${filters.to}:${filters.filesOnly}:${filters.branch}`;
  useEffect(() => {
    if (!orientedLayout || fitKey === previousFitKey.current) return;
    previousFitKey.current = fitKey;
    const frame = window.requestAnimationFrame(() => fitView());
    return () => window.cancelAnimationFrame(frame);
  }, [fitKey, orientedLayout, fitView]);

  const handleZoom = useCallback((delta: number) => {
    updateViewPreferences({ zoom: clampGraphZoom(zoom + delta) });
  }, [updateViewPreferences, zoom]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('button, input, select, [data-graph-control]')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.panX + event.clientX - drag.startX,
      y: drag.panY + event.clientY - drag.startY,
    });
  };

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setIsDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleZoom(event.deltaY > 0 ? -0.1 : 0.1);
  };

  const handleNodeClick = useCallback((sha: string) => {
    if (selectedCommit?.id === sha) {
      setSelectedCommit(null);
      return;
    }
    const fullCommit = commits.find(commit => commit.id === sha);
    if (fullCommit) setSelectedCommit(fullCommit);
  }, [commits, selectedCommit?.id, setSelectedCommit]);

  const handleFiltersChange = (changes: Partial<GraphFilters>) => {
    if (typeof changes.branch === 'string') setBranchFilter(changes.branch);
    setFilters(current => ({ ...current, ...changes }));
  };

  const clearFilters = () => {
    setBranchFilter('all');
    setFilters({ ...EMPTY_GRAPH_FILTERS });
  };

  if (!graphLayout || !orientedLayout || graphLayout.nodes.length === 0) {
    return (
      <div className="flex-1 h-full flex items-center justify-center min-w-0 bg-[var(--graph-bg)]">
        {repositoryEmpty ? (
          <div className="max-w-sm px-6 text-center">
            <BookOpen size={30} className="mx-auto text-[var(--muted)]" />
            <h2 className="mt-3 text-base font-semibold text-[var(--ink)]">Репозиторий пока пуст</h2>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">Создайте первый README и commit — после этого здесь появится граф истории.</p>
            <button type="button" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--ink)] px-3 text-xs font-semibold text-[var(--on-ink)]" onClick={() => setReadmeOpen(true)}>
              <BookOpen size={14} />
              Создать первый README
            </button>
          </div>
        ) : <p className="text-sm text-[var(--muted)]">Нет данных для отображения</p>}
      </div>
    );
  }

  return (
    <div className={`relative flex-1 h-full min-w-0 overflow-hidden bg-[var(--graph-bg)] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`} style={{ isolation: 'isolate', touchAction: 'none' }}>
      <div
        ref={viewportRef}
        className="absolute inset-0 overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onWheel={handleWheel}
        aria-label="Область графа коммитов"
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(var(--graph-dot) .75px, transparent .75px)',
            backgroundSize: '18px 18px',
            maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
          }}
        />

        <div
          className="absolute left-0 top-0"
          style={{
            width: orientedLayout.totalWidth,
            height: orientedLayout.totalHeight,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <svg
            data-commit-graph
            viewBox={`0 0 ${orientedLayout.totalWidth} ${orientedLayout.totalHeight}`}
            width={orientedLayout.totalWidth}
            height={orientedLayout.totalHeight}
            className="absolute inset-0 overflow-visible"
            aria-hidden="true"
          >
            {filteredEdges.map((edge, index) => (
              <path
                key={`${edge.from}-${edge.to}-${index}`}
                d={generateEdgePath(edge, orientedLayout.direction)}
                className="fill-none stroke-[3.5px] stroke-linecap-round opacity-95"
                stroke={edge.color}
                style={{ vectorEffect: 'non-scaling-stroke' }}
              />
            ))}
          </svg>

          {visibleNodes.map(node => (
            <CommitNode
              key={node.sha}
              commit={node}
              isSelected={selectedCommit?.id === node.sha}
              isHead={headShas.has(node.sha)}
              branchColor={orientedLayout.branchColors[node.branch] || '#261732'}
              onClick={handleNodeClick}
            />
          ))}
        </div>

        {visibleNodes.length === 0 && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)]/95 px-4 py-3 text-center shadow-[var(--shadow-border)]">
              <p className="text-xs font-semibold text-[var(--ink)]">Нет коммитов по выбранным фильтрам</p>
              <p className="mt-1 text-xs text-[var(--muted)]">Очистите фильтры, чтобы вернуть граф.</p>
            </div>
          </div>
        )}
      </div>

      <GraphControls
        zoom={zoom}
        direction={direction}
        filters={filters}
        branches={branches}
        authors={authors}
        activeFilterCount={activeFilterCount}
        statsLoading={commitStatsLoading}
        onZoomIn={() => handleZoom(0.1)}
        onZoomOut={() => handleZoom(-0.1)}
        onCenter={fitView}
        onDirectionChange={nextDirection => updateViewPreferences({ direction: nextDirection })}
        onFiltersChange={handleFiltersChange}
        onClearFilters={clearFilters}
      />

      <div className="absolute bottom-3 left-3 z-20 max-w-[min(330px,calc(100%-24px))] rounded-xl border border-[var(--line)] bg-[var(--surface)]/95 p-3 shadow-[var(--shadow-border)] backdrop-blur-sm" data-graph-control>
        <div className="mb-2 text-xs font-extrabold tracking-[1.5px] text-[var(--muted)]">ЛЕГЕНДА ВЕТОК</div>
        <div className="max-h-24 space-y-1 overflow-auto pr-1">
          {branches.map(branch => {
            const isActive = filters.branch === branch.name || (filters.branch === 'all' && branch.name === defaultBranchName);
            const isHead = headShas.has(branch.tipSha);
            return (
              <div key={branch.name} className={`flex items-center gap-2 text-xs ${isActive ? 'font-bold text-[var(--ink)]' : 'text-[var(--muted)]'}`} aria-current={isActive ? 'true' : undefined}>
                <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: branch.color }} />
                <span className="min-w-0 truncate">{branch.name}</span>
                {isActive && <span className="rounded bg-[var(--surface-strong)] px-1 text-xs">активная</span>}
                {isHead && <span className="rounded bg-[var(--sage)] px-1 text-xs font-bold text-[var(--ink)]">HEAD</span>}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--line)] pt-2 text-xs text-[var(--muted)]">
          <span className="flex items-center gap-1"><GitMerge size={12} className="text-[var(--branch-violet)]" /> merge</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full border border-[var(--sage)]" /> выбранный/HEAD</span>
        </div>
      </div>
    </div>
  );
};
