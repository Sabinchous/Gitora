import { Branch, BranchDirection } from '../types';

export interface BranchVisualSettings {
  color: string;
  direction: BranchDirection;
}

export interface BranchColorOption {
  value: string;
  label: string;
}

export interface KeyValueStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export const BRANCH_COLOR_OPTIONS: BranchColorOption[] = [
  { value: '#3B82A8', label: 'Синий' },
  { value: '#3E9EAB', label: 'Бирюзовый' },
  { value: '#5D8B58', label: 'Зелёный' },
  { value: '#A48B36', label: 'Жёлтый' },
  { value: '#B96A3E', label: 'Оранжевый' },
  { value: '#B35D56', label: 'Красный' },
  { value: '#79599F', label: 'Фиолетовый' },
  { value: '#B05C85', label: 'Розовый' },
];

export const DEFAULT_BRANCH_DIRECTION: BranchDirection = 'auto';

const preferenceKey = (repoKey: string) => `gitora-branch-visuals:${encodeURIComponent(repoKey.trim().toLowerCase())}`;

function browserStorage(): KeyValueStorage | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

export function readBranchPreferences(repoKey: string, storage: KeyValueStorage | null = browserStorage()): Record<string, BranchVisualSettings> {
  if (!repoKey || !storage) return {};
  try {
    const raw = storage.getItem(preferenceKey(repoKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<BranchVisualSettings>>;
    return Object.fromEntries(Object.entries(parsed).flatMap(([name, value]) => {
      if (!value || typeof value.color !== 'string') return [];
      const direction = value.direction === 'left' || value.direction === 'right' ? value.direction : DEFAULT_BRANCH_DIRECTION;
      return [[name, { color: value.color, direction }]];
    }));
  } catch {
    return {};
  }
}

export function writeBranchPreferences(repoKey: string, preferences: Record<string, BranchVisualSettings>, storage: KeyValueStorage | null = browserStorage()): void {
  if (!repoKey || !storage) return;
  try {
    storage.setItem(preferenceKey(repoKey), JSON.stringify(preferences));
  } catch {
    // localStorage can be unavailable in private or restricted environments.
  }
}

export function defaultBranchColor(branchName: string, index: number): string {
  if (branchName === 'main' || branchName === 'master') return 'var(--branch-main)';
  return BRANCH_COLOR_OPTIONS[Math.max(0, index - 1) % BRANCH_COLOR_OPTIONS.length].value;
}

export function mergeBranchPreferences(repoKey: string, branches: Array<Pick<Branch, 'name' | 'tipSha'>>, storage: KeyValueStorage | null = browserStorage()): Branch[] {
  const saved = readBranchPreferences(repoKey, storage);
  const nextPreferences: Record<string, BranchVisualSettings> = {};
  const nextBranches = branches.map((branch, index) => {
    const existing = saved[branch.name];
    const settings = existing ?? { color: defaultBranchColor(branch.name, index), direction: DEFAULT_BRANCH_DIRECTION };
    nextPreferences[branch.name] = settings;
    return { ...branch, color: settings.color, direction: settings.direction };
  });
  writeBranchPreferences(repoKey, nextPreferences, storage);
  return nextBranches;
}

export function updateBranchPreference(repoKey: string, branchName: string, changes: Partial<BranchVisualSettings>, storage: KeyValueStorage | null = browserStorage()): Record<string, BranchVisualSettings> {
  const preferences = readBranchPreferences(repoKey, storage);
  const current = preferences[branchName] ?? { color: defaultBranchColor(branchName, 1), direction: DEFAULT_BRANCH_DIRECTION };
  const next = { ...preferences, [branchName]: { ...current, ...changes } };
  writeBranchPreferences(repoKey, next, storage);
  return next;
}

export function migrateBranchPreference(repoKey: string, previousName: string, nextName: string, storage: KeyValueStorage | null = browserStorage()): void {
  const preferences = readBranchPreferences(repoKey, storage);
  if (!preferences[previousName]) return;
  preferences[nextName] = preferences[previousName];
  delete preferences[previousName];
  writeBranchPreferences(repoKey, preferences, storage);
}

export function removeBranchPreference(repoKey: string, branchName: string, storage: KeyValueStorage | null = browserStorage()): void {
  const preferences = readBranchPreferences(repoKey, storage);
  if (!preferences[branchName]) return;
  delete preferences[branchName];
  writeBranchPreferences(repoKey, preferences, storage);
}

export function branchPreferenceStorageKey(repoKey: string): string {
  return preferenceKey(repoKey);
}
