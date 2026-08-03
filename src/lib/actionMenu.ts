export interface ActionAvailabilityContext {
  connected: boolean;
  hasProject: boolean;
  loading: boolean;
  graphVisible: boolean;
  hasSelectedCommit: boolean;
}

export interface ActionDescriptor {
  id: string;
  label: string;
  surface: 'primary' | 'project-more' | 'sidebar-more' | 'commit-more' | 'graph-more';
}

const PRIMARY_ACTIONS: ActionDescriptor[] = [
  { id: 'refresh', label: 'Обновить', surface: 'primary' },
  { id: 'sync', label: 'Синхронизация', surface: 'primary' },
  { id: 'create-branch', label: 'Создать ветку', surface: 'primary' },
];

const PROJECT_MORE_ACTIONS: ActionDescriptor[] = [
  { id: 'readme', label: 'README', surface: 'project-more' },
  { id: 'changes', label: 'Изменения', surface: 'project-more' },
  { id: 'release', label: 'Релиз', surface: 'project-more' },
  { id: 'edit-repository', label: 'Редактировать', surface: 'project-more' },
  { id: 'manage-branches', label: 'Управление ветками', surface: 'project-more' },
  { id: 'copy-link', label: 'Копировать ссылку', surface: 'project-more' },
  { id: 'open-github', label: 'Открыть на GitHub', surface: 'project-more' },
];

const SIDEBAR_MORE_ACTIONS: ActionDescriptor[] = [
  { id: 'updates', label: 'Обновления', surface: 'sidebar-more' },
  { id: 'logout', label: 'Отключить GitHub', surface: 'sidebar-more' },
];

const COMMIT_MORE_ACTIONS: ActionDescriptor[] = [
  { id: 'copy-sha', label: 'Копировать SHA', surface: 'commit-more' },
  { id: 'download-version', label: 'Скачать эту версию', surface: 'commit-more' },
  { id: 'open-commit-github', label: 'Открыть на GitHub', surface: 'commit-more' },
];

export function getPrimaryActions(context: ActionAvailabilityContext): ActionDescriptor[] {
  if (!context.connected || !context.hasProject) return [];
  return PRIMARY_ACTIONS.filter(action => action.id === 'sync' || !context.loading);
}

export function getProjectMoreActions(context: ActionAvailabilityContext): ActionDescriptor[] {
  return context.connected && context.hasProject ? [...PROJECT_MORE_ACTIONS] : [];
}

export function getSidebarMoreActions(context: ActionAvailabilityContext): ActionDescriptor[] {
  return SIDEBAR_MORE_ACTIONS.filter(action => action.id !== 'logout' || context.connected);
}

export function getCommitMoreActions(context: ActionAvailabilityContext): ActionDescriptor[] {
  return context.hasSelectedCommit && context.hasProject ? [...COMMIT_MORE_ACTIONS] : [];
}

export function getGraphMoreActions(context: ActionAvailabilityContext): ActionDescriptor[] {
  if (!context.hasProject) return [];
  return [{
    id: context.graphVisible ? 'hide-graph' : 'show-graph',
    label: context.graphVisible ? 'Скрыть граф' : 'Показать граф',
    surface: 'graph-more',
  }];
}
