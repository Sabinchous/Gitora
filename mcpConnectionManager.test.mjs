import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createMcpBridge } = require('./electron/mcpBridge.cjs');
const { McpConnectionManager } = require('./mcpConnectionManager.cjs');
const activeBridges = [];
const activeManagers = [];

function socketPathFor(testDir) {
  if (process.platform === 'win32') return `\\\\.\\pipe\\gitora-mcp-manager-${process.pid}-${Date.now()}`;
  return path.join(testDir, 'mcp.sock');
}

async function metadataReader(metadataPath) {
  return [{ metadata: JSON.parse(await readFile(metadataPath, 'utf8')), metadataPath }];
}

afterEach(async () => {
  for (const manager of activeManagers.splice(0)) manager.close();
  await Promise.all(activeBridges.splice(0).map(bridge => bridge.stop()));
});

describe('MCP connection manager', () => {
  it('reuses one bridge socket for heartbeat and multiple requests', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-manager-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    let connectionCount = 0;
    const bridge = createMcpBridge({
      metadataPath,
      socketPath: socketPathFor(testDir),
      onConnection: () => { connectionCount += 1; },
      request: async endpoint => ({ endpoint, source: 'electron' }),
    });
    activeBridges.push(bridge);
    await bridge.start();

    const manager = new McpConnectionManager({
      clientId: 'test',
      readBridgeMetadataInfos: () => metadataReader(metadataPath),
    });
    activeManagers.push(manager);

    await manager.connect();
    await manager.request('/user');
    await manager.request('/repos/example/project/branches');

    expect(connectionCount).toBe(1);
    expect(manager.isConnected()).toBe(true);
    expect(manager.getSessionId()).toHaveLength(36);
    await rm(testDir, { recursive: true, force: true });
  });

  it('reconnects to a new bridge session without replacing the manager', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-manager-reconnect-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    const socketPath = socketPathFor(testDir);
    let connectionCount = 0;
    const createBridge = () => createMcpBridge({
      metadataPath,
      socketPath,
      onConnection: () => { connectionCount += 1; },
      request: async endpoint => ({ endpoint, source: 'electron' }),
    });
    const firstBridge = createBridge();
    activeBridges.push(firstBridge);
    await firstBridge.start();

    const manager = new McpConnectionManager({
      clientId: 'test',
      readBridgeMetadataInfos: () => metadataReader(metadataPath),
    });
    activeManagers.push(manager);
    await manager.connect();
    const firstSessionId = manager.getSessionId();

    await firstBridge.stop({ notifyClients: false });
    const secondBridge = createBridge();
    activeBridges.push(secondBridge);
    await secondBridge.start();
    expect(await manager.reconnect(new Error('bridge restarted'))).toBe(true);

    expect(manager.getSessionId()).not.toBe(firstSessionId);
    expect(connectionCount).toBe(2);
    expect(await manager.request('/user')).toEqual({ endpoint: '/user', source: 'electron' });
    await rm(testDir, { recursive: true, force: true });
  });
});
