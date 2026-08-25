import { describe, expect, it } from 'vitest';
import {
  collaboratorForContributor,
  contributorPercent,
  isAnonymousContributor,
  permissionToTeamRole,
  sortContributors,
  teamRoleToPermission,
} from './team';

describe('team helpers', () => {
  it('maps GitHub permissions to visible roles', () => {
    expect(permissionToTeamRole('pull')).toBe('Read');
    expect(permissionToTeamRole('triage')).toBe('Triage');
    expect(permissionToTeamRole('push')).toBe('Write');
    expect(permissionToTeamRole('maintain')).toBe('Maintain');
    expect(permissionToTeamRole('admin')).toBe('Admin');
    expect(teamRoleToPermission('Write')).toBe('push');
    expect(permissionToTeamRole(undefined, { admin: true })).toBe('Admin');
  });

  it('sorts commits and calculates safe contribution percentages', () => {
    const contributors = [
      { login: 'zoe', contributions: 2 },
      { login: 'alex', contributions: 10 },
      { login: 'mira', contributions: 2 },
    ];
    expect(sortContributors(contributors, 'commits').map(item => item.login)).toEqual(['alex', 'mira', 'zoe']);
    expect(sortContributors(contributors, 'name').map(item => item.login)).toEqual(['alex', 'mira', 'zoe']);
    expect(contributorPercent(2, 14)).toBeCloseTo(14.2857, 3);
    expect(contributorPercent(2, 0)).toBe(0);
  });

  it('joins access and contribution only by exact login', () => {
    const collaborator = { login: 'alex', avatar_url: '' };
    expect(collaboratorForContributor({ login: 'alex', contributions: 1 }, [collaborator])).toBe(collaborator);
    expect(collaboratorForContributor({ login: 'Alex', contributions: 1 }, [collaborator])).toBeUndefined();
    expect(collaboratorForContributor({ login: null, contributions: 1 }, [collaborator])).toBeUndefined();
  });

  it('keeps anonymous contributors outside profile links', () => {
    expect(isAnonymousContributor({ contributions: 3, email: 'anon@example.com' })).toBe(true);
    expect(isAnonymousContributor({ login: 'alex', contributions: 3 })).toBe(false);
  });
});

