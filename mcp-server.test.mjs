import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createMcpBridge } = require('./electron/mcpBridge.cjs');

const activeBridges = [];
const activeProcesses = [];

function socketPathFor(testDir) {
  if (process.platform === 'win32') return `\\\\.\\pipe\\gitora-mcp-test-${process.pid}-${Date.now()}`;
  return path.join(testDir, 'mcp.sock');
}

function waitForOutput(child, needle, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${needle}: ${output}`)), timeoutMs);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      output += chunk;
      if (!output.includes(needle)) return;
      clearTimeout(timer);
      resolve(output);
    });
  });
}

function waitForJsonResponse(child, id, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for MCP response ${id}: ${output}`)), timeoutMs);
    child.stdout.setEncoding('utf8');
    const onData = chunk => {
      output += chunk;
      const lines = output.split(/\r?\n/);
      output = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id !== id) continue;
        clearTimeout(timer);
        child.stdout.removeListener('data', onData);
        resolve(message);
        return;
      }
    };
    child.stdout.on('data', onData);
  });
}

function sendRpc(child, id, method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
}

afterEach(async () => {
  for (const child of activeProcesses.splice(0)) {
    if (!child.killed && child.exitCode === null) child.kill();
  }
  await Promise.all(activeBridges.splice(0).map(bridge => bridge.stop()));
});

describe('MCP server lifecycle', () => {
  it('exits cleanly after Gitora closes the bridge', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-server-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    const bridge = createMcpBridge({
      metadataPath,
      socketPath: socketPathFor(testDir),
      request: async () => [],
    });
    activeBridges.push(bridge);
    await bridge.start();

    const child = spawn(process.execPath, [
      path.resolve('mcp-server.cjs'),
      '--client=test',
      `--bridge-metadata=${metadataPath}`,
    ], {
      cwd: path.resolve('.'),
      env: { ...process.env, GITORA_MCP_HEARTBEAT_MS: '100' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    activeProcesses.push(child);

    const startedOutput = await waitForOutput(child, 'mcp_server_started');
    expect(startedOutput).toContain('[MCP Startup] Started: true');
    expect(startedOutput).toContain('[MCP Startup] Tools loaded: 15');
    expect(startedOutput).toContain('mcp_server_started');

    await bridge.stop();
    const [code] = await once(child, 'exit');
    expect(code).toBe(0);

    await rm(testDir, { recursive: true, force: true });
  });

  it('starts from the configured server and exposes Gitora tools to the client', async () => {
    const testDir = await mkdtemp(path.join(os.tmpdir(), 'gitora-mcp-tools-'));
    const metadataPath = path.join(testDir, 'mcp-bridge.json');
    const bridge = createMcpBridge({
      metadataPath,
      socketPath: socketPathFor(testDir),
      request: async () => [],
    });
    activeBridges.push(bridge);
    await bridge.start();

    const child = spawn(process.execPath, [
      path.resolve('mcp-server.cjs'),
      '--client=test',
      `--bridge-metadata=${metadataPath}`,
    ], {
      cwd: path.resolve('.'),
      env: { ...process.env, GITORA_MCP_HEARTBEAT_MS: '100' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    activeProcesses.push(child);
    await waitForOutput(child, 'mcp_server_started');

    sendRpc(child, 1, 'initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    });
    const initialized = await waitForJsonResponse(child, 1);
    expect(initialized.result.serverInfo.name).toBe('gitora');
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

    sendRpc(child, 2, 'tools/list', {});
    const tools = await waitForJsonResponse(child, 2);
    const toolNames = tools.result.tools.map(tool => tool.name);
    expect(toolNames).toEqual(expect.arrayContaining([
      'list_repos',
      'create_repo_file',
      'create_issue',
      'add_issue_comment',
      'create_pull_request',
    ]));

    await bridge.stop();
    const [code] = await once(child, 'exit');
    expect(code).toBe(0);
    await rm(testDir, { recursive: true, force: true });
  });
});
