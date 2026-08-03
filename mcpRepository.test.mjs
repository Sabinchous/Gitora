import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createRepositoryFile, isEmptyRepository } = require('./mcpRepository.cjs');

describe('empty repository file workflow', () => {
  it('creates blob, tree, commit, and branch ref for an empty repository', async () => {
    const calls = [];
    const result = await createRepositoryFile(async (endpoint, options = {}) => {
      calls.push({ endpoint, options });
      if (endpoint === '/repos/demo/Test') return { empty: true, default_branch: null };
      if (endpoint.endsWith('/git/blobs')) return { sha: 'blob-sha' };
      if (endpoint.endsWith('/git/trees')) return { sha: 'tree-sha' };
      if (endpoint.endsWith('/git/commits')) return { sha: 'commit-sha' };
      if (endpoint.endsWith('/git/refs')) return { ref: 'refs/heads/main' };
      throw new Error(`Unexpected endpoint ${endpoint}`);
    }, {
      owner: 'demo',
      repo: 'Test',
      path: 'hello.py',
      message: 'Add hello.py',
      content: 'print("Hellou!")',
    });

    expect(calls.map(call => call.endpoint)).toEqual([
      '/repos/demo/Test',
      '/repos/demo/Test/git/blobs',
      '/repos/demo/Test/git/trees',
      '/repos/demo/Test/git/commits',
      '/repos/demo/Test/git/refs',
    ]);
    expect(calls[1].options.body).toEqual({ content: 'cHJpbnQoIkhlbGxvdSEiKQ==', encoding: 'base64' });
    expect(calls.at(-1).options.body).toEqual({ ref: 'refs/heads/main', sha: 'commit-sha' });
    expect(result.commit.sha).toBe('commit-sha');
  });

  it('uses contents API for a non-empty repository', async () => {
    const calls = [];
    await createRepositoryFile(async (endpoint, options = {}) => {
      calls.push({ endpoint, options });
      if (endpoint === '/repos/demo/Test') return { default_branch: 'main' };
      return { content: { path: 'hello.py' }, commit: { sha: 'commit-sha' } };
    }, {
      owner: 'demo',
      repo: 'Test',
      path: 'hello.py',
      message: 'Update hello.py',
      content: 'print("Hellou!")',
    });

    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      endpoint: '/repos/demo/Test/contents/hello.py',
      options: { method: 'PUT' },
    });
    expect(calls[1].options.body.content).toBe('cHJpbnQoIkhlbGxvdSEiKQ==');
  });

  it('recognizes empty repository metadata', () => {
    expect(isEmptyRepository({ empty: true, default_branch: null })).toBe(true);
    expect(isEmptyRepository({ default_branch: 'main' })).toBe(false);
  });
});
