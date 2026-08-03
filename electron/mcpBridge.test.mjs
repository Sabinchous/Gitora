import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createMcpBridge } = require('./mcpBridge.cjs');

const activeBridges = [];

function socketPathFor(testDir) {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\gitora-mcp-test-${randomBytes(8).toString('hex')}`;
  }
  return path.join(testDir, 'mcp.sock');
}

function requestBridge(socketPath, request) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let response = '';

    socket.setEncoding('utf8');
    socket.setTimeout(2000, () => {
      socket.destroy();
      reject(new Error('MCP bridge response timed out'));
    });
    socket.on('error', reject);
    socket.on('data', chunk => {
      response += chunk;
      const lineEnd = response.indexOf('\n');
      if (lineEnd === -1) return;
      socket.destroy();
      resolve(JSON.parse(response.slice(0, lineEnd)));
    });
    socket.on('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
  });
}

afterEach(async () => {
  await Promise.all(activeBridges.splice(0).map(bridge => bridge.stop()));
});

describe('MCP session bridge', () => {
  it('forwards an authenticated GitHub endpoint without storing a token', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    const bridge = createMcpBridge({
      metadataPath,
      socketPath: socketPathFor(testDir),
      request: async endpoint => ({ endpoint, source: 'electron' }),
    });
    activeBridges.push(bridge);

    await bridge.start();
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const response = await requestBridge(metadata.socketPath, {
      secret: metadata.secret,
      endpoint: '/user',
    });

    expect(metadata).toMatchObject({
      version: 1,
      socketPath: metadata.socketPath,
      secret: metadata.secret,
    });
    expect(metadata.secret).toHaveLength(64);
    expect(metadata.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response).toEqual({
      success: true,
      data: { endpoint: '/user', source: 'electron' },
    });

    await rm(testDir, { recursive: true, force: true });
  });

  it('rejects an invalid secret and an external endpoint', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    let requestCount = 0;
    const bridge = createMcpBridge({
      metadataPath,
      socketPath: socketPathFor(testDir),
      request: async () => {
        requestCount += 1;
        return null;
      },
    });
    activeBridges.push(bridge);

    await bridge.start();
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const invalidSecret = await requestBridge(metadata.socketPath, {
      secret: 'wrong-secret',
      endpoint: '/user',
    });
    const invalidEndpoint = await requestBridge(metadata.socketPath, {
      secret: metadata.secret,
      endpoint: 'https://example.com/secret',
    });

    expect(invalidSecret).toEqual({ success: false, error: 'Unauthorized MCP bridge request' });
    expect(invalidEndpoint).toEqual({ success: false, error: 'Invalid MCP endpoint' });
    expect(requestCount).toBe(0);

    await rm(testDir, { recursive: true, force: true });
  });

  it('answers a local health request without calling GitHub', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    let requestCount = 0;
    const bridge = createMcpBridge({
      metadataPath,
      socketPath: socketPathFor(testDir),
      request: async () => {
        requestCount += 1;
        return null;
      },
    });
    activeBridges.push(bridge);

    await bridge.start();
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const response = await requestBridge(metadata.socketPath, {
      secret: metadata.secret,
      endpoint: '/__gitora__/health',
      client: 'manual',
    });

    expect(response.success).toBe(true);
    expect(response.data.bridge).toBe('gitora');
    expect(requestCount).toBe(0);

    await rm(testDir, { recursive: true, force: true });
  });

  it('removes session metadata when the bridge stops', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    const bridge = createMcpBridge({
      metadataPath,
      socketPath: socketPathFor(testDir),
      request: async () => null,
    });
    activeBridges.push(bridge);

    await bridge.start();
    await bridge.stop();

    await expect(readFile(metadataPath, 'utf8')).rejects.toThrow();
    expect(bridge.isRunning()).toBe(false);
    await rm(testDir, { recursive: true, force: true });
  });

  it('forwards allowlisted Git write requests with their JSON body', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    let received;
    const bridge = createMcpBridge({
      metadataPath,
      socketPath: socketPathFor(testDir),
      request: async (endpoint, options) => {
        received = { endpoint, options };
        return { source: 'electron' };
      },
      isWriteAllowed: () => true,
    });
    activeBridges.push(bridge);

    await bridge.start();
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const response = await requestBridge(metadata.socketPath, {
      secret: metadata.secret,
      method: 'POST',
      endpoint: '/repos/demo/project/git/blobs',
      body: JSON.stringify({ content: 'demo', encoding: 'utf-8' }),
    });

    expect(response).toEqual({ success: true, data: { source: 'electron' } });
    expect(received).toEqual({
      endpoint: '/repos/demo/project/git/blobs',
      options: { method: 'POST', body: JSON.stringify({ content: 'demo', encoding: 'utf-8' }) },
    });

    await rm(testDir, { recursive: true, force: true });
  });

  it('rejects write requests outside the Git object allowlist', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    let requestCount = 0;
    const bridge = createMcpBridge({
      metadataPath,
      socketPath: socketPathFor(testDir),
      request: async () => {
        requestCount += 1;
        return null;
      },
    });
    activeBridges.push(bridge);

    await bridge.start();
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const response = await requestBridge(metadata.socketPath, {
      secret: metadata.secret,
      method: 'POST',
      endpoint: '/user/repos',
      body: JSON.stringify({ name: 'unexpected' }),
    });

    expect(response).toEqual({ success: false, error: 'Invalid MCP write endpoint' });
    expect(requestCount).toBe(0);

    await rm(testDir, { recursive: true, force: true });
  });

  it('rejects allowed write endpoints until Gitora approval is granted', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    let requestCount = 0;
    const bridge = createMcpBridge({
      metadataPath,
      socketPath: socketPathFor(testDir),
      request: async () => {
        requestCount += 1;
        return null;
      },
    });
    activeBridges.push(bridge);

    await bridge.start();
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const response = await requestBridge(metadata.socketPath, {
      secret: metadata.secret,
      method: 'PUT',
      endpoint: '/repos/demo/project/contents/test.txt',
      body: JSON.stringify({ message: 'test', content: 'dGVzdA==' }),
    });

    expect(response).toMatchObject({ success: false, code: 'MCP_WRITE_APPROVAL_REQUIRED' });
    expect(requestCount).toBe(0);
    await rm(testDir, { recursive: true, force: true });
  });

  it('returns the required permission when GitHub rejects a write', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    const bridge = createMcpBridge({
      metadataPath,
      socketPath: socketPathFor(testDir),
      request: async () => {
        const error = new Error('Resource not accessible by integration');
        error.code = 'permissions';
        error.status = 403;
        error.requiredPermission = 'Contents: write';
        throw error;
      },
      isWriteAllowed: () => true,
    });
    activeBridges.push(bridge);

    await bridge.start();
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const response = await requestBridge(metadata.socketPath, {
      secret: metadata.secret,
      method: 'PUT',
      endpoint: '/repos/demo/project/contents/test.txt',
      body: JSON.stringify({ message: 'test', content: 'dGVzdA==' }),
    });

    expect(response).toMatchObject({
      success: false,
      error: 'Resource not accessible by integration',
      code: 'permissions',
      status: 403,
      requiredPermission: 'Contents: write',
    });

    await rm(testDir, { recursive: true, force: true });
  });

  it('allows the initial contents commit for an empty repository', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    const bridge = createMcpBridge({
      metadataPath,
      socketPath: socketPathFor(testDir),
      request: async (endpoint, options) => ({ endpoint, options }),
      isWriteAllowed: () => true,
    });
    activeBridges.push(bridge);

    await bridge.start();
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const body = JSON.stringify({ message: 'init', content: 'ZGVtbwo=' });
    const response = await requestBridge(metadata.socketPath, {
      secret: metadata.secret,
      method: 'PUT',
      endpoint: '/repos/demo/project/contents/README.md',
      body,
    });

    expect(response).toEqual({
      success: true,
      data: {
        endpoint: '/repos/demo/project/contents/README.md',
        options: { method: 'PUT', body },
      },
    });

    await rm(testDir, { recursive: true, force: true });
  });

  it('allows issue, issue-comment, and pull-request writes', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    const received = [];
    const bridge = createMcpBridge({
      metadataPath,
      socketPath: socketPathFor(testDir),
      request: async (endpoint, options) => {
        received.push({ endpoint, options });
        return { ok: true };
      },
      isWriteAllowed: () => true,
    });
    activeBridges.push(bridge);

    await bridge.start();
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    for (const endpoint of [
      '/repos/demo/project/issues',
      '/repos/demo/project/issues/7/comments',
      '/repos/demo/project/pulls',
    ]) {
      const response = await requestBridge(metadata.socketPath, {
        secret: metadata.secret,
        method: 'POST',
        endpoint,
        body: JSON.stringify({ title: 'test' }),
      });
      expect(response).toEqual({ success: true, data: { ok: true } });
    }
    expect(received.map(item => item.endpoint)).toEqual([
      '/repos/demo/project/issues',
      '/repos/demo/project/issues/7/comments',
      '/repos/demo/project/pulls',
    ]);

    await rm(testDir, { recursive: true, force: true });
  });
});
