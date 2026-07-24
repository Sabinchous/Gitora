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

    expect(metadata).toEqual({
      version: 1,
      socketPath: metadata.socketPath,
      secret: metadata.secret,
    });
    expect(metadata.secret).toHaveLength(64);
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
});
