import {
  GitHubCollaborator,
  GitHubCollaboratorPermission,
  GitHubContributor,
  GitHubTeamRole,
} from '../types';

const PERMISSION_ROLES: Record<GitHubCollaboratorPermission, GitHubTeamRole> = {
  pull: 'Read',
  triage: 'Triage',
  push: 'Write',
  maintain: 'Maintain',
  admin: 'Admin',
};

const ROLE_PERMISSIONS: Record<GitHubTeamRole, GitHubCollaboratorPermission> = {
  Read: 'pull',
  Triage: 'triage',
  Write: 'push',
  Maintain: 'maintain',
  Admin: 'admin',
};

export function permissionToTeamRole(permission?: string, permissions?: GitHubCollaborator['permissions']): GitHubTeamRole {
  if (permission && permission.toLowerCase() in PERMISSION_ROLES) {
    return PERMISSION_ROLES[permission.toLowerCase() as GitHubCollaboratorPermission];
  }
  if (permissions?.admin) return 'Admin';
  if (permissions?.maintain) return 'Maintain';
  if (permissions?.push) return 'Write';
  if (permissions?.triage) return 'Triage';
  return 'Read';
}

export function teamRoleToPermission(role: GitHubTeamRole): GitHubCollaboratorPermission {
  return ROLE_PERMISSIONS[role];
}

export function isAnonymousContributor(contributor: GitHubContributor): boolean {
  return contributor.anonymous === true || !contributor.login;
}

export function contributorPercent(contributions: number, total: number): number {
  if (!Number.isFinite(contributions) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, (contributions / total) * 100));
}

export type ContributorSort = 'commits' | 'name';

export function sortContributors(contributors: GitHubContributor[], sort: ContributorSort): GitHubContributor[] {
  return [...contributors].sort((left, right) => {
    if (sort === 'name') {
      return contributorLabel(left).localeCompare(contributorLabel(right), undefined, { sensitivity: 'base' })
        || right.contributions - left.contributions;
    }
    return right.contributions - left.contributions
      || contributorLabel(left).localeCompare(contributorLabel(right), undefined, { sensitivity: 'base' });
  });
}

export function contributorLabel(contributor: GitHubContributor): string {
  return contributor.name?.trim() || contributor.login?.trim() || (contributor.email?.trim() ? 'Anonymous contributor' : 'Unknown contributor');
}

export function sameGitHubLogin(left?: string | null, right?: string | null): boolean {
  return Boolean(left && right && left === right);
}

export function collaboratorForContributor(
  contributor: GitHubContributor,
  collaborators: GitHubCollaborator[],
): GitHubCollaborator | undefined {
  if (!contributor.login) return undefined;
  return collaborators.find(collaborator => sameGitHubLogin(collaborator.login, contributor.login));
}

