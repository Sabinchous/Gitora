import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  getLatestStableRelease,
  isNewerVersion,
  isSameVersion,
  sortReleasesByVersion,
} from './version';

describe('version comparison', () => {
  it('compares numeric version segments', () => {
    expect(compareVersions('v0.2.10', '0.2.9')).toBe(1);
    expect(compareVersions('0.2.2', '0.2.2.0')).toBe(0);
    expect(compareVersions('0.1.9', '0.2')).toBe(-1);
  });

  it('does not treat malformed versions as newer', () => {
    expect(isNewerVersion('latest', '0.2.2')).toBe(false);
    expect(isNewerVersion('0.3.0-beta', '0.2.2')).toBe(false);
  });

  it('normalizes release tags when checking the installed version', () => {
    expect(isSameVersion('v0.2.2', '0.2.2')).toBe(true);
    expect(isSameVersion('0.2.0', '0.2.2')).toBe(false);
    expect(isSameVersion('latest', '0.2.2')).toBe(false);
  });

  it('sorts releases from newest to oldest without mutating the input', () => {
    const releases = [{ tag: 'v0.2.0' }, { tag: 'v0.2.2' }, { tag: 'v0.1.12' }];

    expect(sortReleasesByVersion(releases).map(release => release.tag)).toEqual([
      'v0.2.2',
      'v0.2.0',
      'v0.1.12',
    ]);
    expect(releases.map(release => release.tag)).toEqual(['v0.2.0', 'v0.2.2', 'v0.1.12']);
  });

  it('selects the highest stable release', () => {
    const latest = getLatestStableRelease([
      { tag: 'v0.2.2', prerelease: false },
      { tag: 'v0.3.0-beta', prerelease: true },
      { tag: 'v0.2.4', prerelease: false },
    ]);

    expect(latest?.tag).toBe('v0.2.4');
  });
});
