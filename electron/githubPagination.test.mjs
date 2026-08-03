import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { apiEndpointFromUrl, fetchAllPages, nextLinkFromHeader } = require('./githubPagination.cjs');

describe('GitHub pagination', () => {
  it('extracts the rel=next URL and ignores other relations', () => {
    const header = '<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=4>; rel="last"';
    expect(nextLinkFromHeader(header)).toBe('https://api.github.com/user/repos?page=2');
    expect(nextLinkFromHeader('<https://example.com/other>; rel="next"')).toBe('https://example.com/other');
    expect(nextLinkFromHeader('')).toBeNull();
  });

  it('follows every GitHub page and converts next links to API endpoints', async () => {
    const calls = [];
    const pages = new Map([
      ['/user/repos?per_page=100', {
        data: [{ name: 'first' }],
        link: '<https://api.github.com/user/repos?per_page=100&page=2>; rel="next"',
      }],
      ['/user/repos?per_page=100&page=2', {
        data: [{ name: 'second' }],
        link: '<https://api.github.com/user/repos?per_page=100&page=1>; rel="prev"',
      }],
    ]);

    const result = await fetchAllPages('/user/repos?per_page=100', async endpoint => {
      calls.push(endpoint);
      return pages.get(endpoint);
    });

    expect(result).toEqual([{ name: 'first' }, { name: 'second' }]);
    expect(calls).toEqual(['/user/repos?per_page=100', '/user/repos?per_page=100&page=2']);
    expect(apiEndpointFromUrl('https://api.github.com/user/repos?page=3', 'https://api.github.com'))
      .toBe('/user/repos?page=3');
  });

  it('rejects pagination links that leave the GitHub API origin', async () => {
    await expect(fetchAllPages('/user/repos?per_page=100', async () => ({
      data: [{ name: 'first' }],
      link: '<https://example.com/steal>; rel="next"',
    }))).rejects.toThrow('unexpected origin');
  });
});
