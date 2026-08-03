import { describe, expect, it } from 'vitest';
import {
  getCommitMoreActions,
  getGraphMoreActions,
  getPrimaryActions,
  getProjectMoreActions,
  getSidebarMoreActions,
} from './actionMenu';

const connectedProject = {
  connected: true,
  hasProject: true,
  loading: false,
  graphVisible: true,
  hasSelectedCommit: true,
};

describe('action menu availability', () => {
  it('keeps only common project actions in the primary toolbar', () => {
    expect(getPrimaryActions(connectedProject).map(action => action.id)).toEqual(['refresh', 'sync', 'create-branch']);
  });

  it('does not expose project actions before a repository is selected', () => {
    expect(getPrimaryActions({ ...connectedProject, hasProject: false })).toEqual([]);
    expect(getProjectMoreActions({ ...connectedProject, hasProject: false })).toEqual([]);
  });

  it('removes loading-sensitive refresh and branch actions while sync remains available', () => {
    expect(getPrimaryActions({ ...connectedProject, loading: true }).map(action => action.id)).toEqual(['sync']);
  });

  it('shows service actions only in the sidebar menu', () => {
    const ids = getSidebarMoreActions(connectedProject).map(action => action.id);
    expect(ids).toEqual(['updates', 'logout']);
  });

  it('shows only supported commit actions and never unsupported git operations', () => {
    const ids = getCommitMoreActions(connectedProject).map(action => action.id);
    expect(ids).toEqual(['copy-sha', 'download-version', 'open-commit-github']);
    expect(ids).not.toEqual(expect.arrayContaining(['checkout', 'cherry-pick', 'revert']));
  });

  it('switches the graph menu between hide and show', () => {
    expect(getGraphMoreActions(connectedProject)[0]?.id).toBe('hide-graph');
    expect(getGraphMoreActions({ ...connectedProject, graphVisible: false })[0]?.id).toBe('show-graph');
  });
});
