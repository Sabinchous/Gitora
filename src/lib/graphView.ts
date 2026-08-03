import { GraphDirection } from './graphLayout';

export interface GraphViewPreferences {
  zoom: number;
  direction: GraphDirection;
}

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export const GRAPH_VIEW_SETTINGS_KEY = 'gitora-graph-view';
export const MIN_GRAPH_ZOOM = 0.4;
export const MAX_GRAPH_ZOOM = 2;

const DEFAULT_PREFERENCES: GraphViewPreferences = {
  zoom: 1,
  direction: 'down',
};

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function validDirection(value: unknown): value is GraphDirection {
  return value === 'down' || value === 'up' || value === 'right' || value === 'left';
}

function migrateDirection(value: unknown): GraphDirection | null {
  if (validDirection(value)) return value;
  if (value === 'vertical') return 'down';
  if (value === 'horizontal') return 'right';
  return null;
}

function validZoom(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_GRAPH_ZOOM && value <= MAX_GRAPH_ZOOM;
}

export function readGraphViewPreferences(
  projectId: string,
  storage: StorageLike | null = browserStorage(),
): GraphViewPreferences {
  const fallback = { ...DEFAULT_PREFERENCES };
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(`${GRAPH_VIEW_SETTINGS_KEY}:${projectId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<GraphViewPreferences>;
    return {
      zoom: validZoom(parsed.zoom) ? parsed.zoom : fallback.zoom,
      direction: migrateDirection(parsed.direction) ?? fallback.direction,
    };
  } catch {
    return fallback;
  }
}

export function saveGraphViewPreferences(
  projectId: string,
  preferences: GraphViewPreferences,
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(`${GRAPH_VIEW_SETTINGS_KEY}:${projectId}`, JSON.stringify(preferences));
  } catch {
    // Ignore restricted storage contexts.
  }
}

export function clampGraphZoom(value: number): number {
  return Math.min(MAX_GRAPH_ZOOM, Math.max(MIN_GRAPH_ZOOM, Math.round(value * 10) / 10));
}
