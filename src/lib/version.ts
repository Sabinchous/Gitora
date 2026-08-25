export interface VersionedRelease {
  tag: string;
  prerelease?: boolean;
}

function parseVersion(version: string): number[] | null {
  const value = String(version ?? '').trim().replace(/^v/i, '').split('+')[0];
  if (value.includes('-') || !/^\d+(?:\.\d+)*$/.test(value)) return null;

  const parts = value.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function displayVersion(version: string): string {
  return String(version ?? '').trim().replace(/^v/i, '') || '—';
}

export function compareVersions(leftVersion: string, rightVersion: string): number {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);
  if (!left || !right) return 0;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }

  return 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

export function isSameVersion(leftVersion: string, rightVersion: string): boolean {
  if (!parseVersion(leftVersion) || !parseVersion(rightVersion)) return false;
  return compareVersions(leftVersion, rightVersion) === 0;
}

export function sortReleasesByVersion<T extends VersionedRelease>(releases: readonly T[]): T[] {
  return [...releases].sort((left, right) => compareVersions(right.tag, left.tag));
}

export function getLatestStableRelease<T extends VersionedRelease>(releases: readonly T[]): T | null {
  return releases.reduce<T | null>((latest, release) => {
    if (release.prerelease || !parseVersion(release.tag)) return latest;
    if (!latest || compareVersions(release.tag, latest.tag) > 0) return release;
    return latest;
  }, null);
}
