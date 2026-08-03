import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  hasJsonMcpServer,
  hasTomlMcpServer,
  mcpServerDefinition,
  removeJsonMcpServer,
  removeTomlMcpServer,
  tomlTemplate,
  upsertJsonMcpServer,
  upsertTomlMcpServer,
} = require('./aiConfig.cjs');

const server = mcpServerDefinition('C:\\Program Files\\Gitora\\Gitora.exe', ['mcp-server.cjs'], { ELECTRON_RUN_AS_NODE: '1' });

describe('AI client configuration', () => {
  it('adds Gitora to JSON without removing other MCP servers', () => {
    const result = upsertJsonMcpServer(JSON.stringify({ mcpServers: { other: { command: 'other' } }, theme: 'dark' }), server);
    const parsed = JSON.parse(result);

    expect(parsed.theme).toBe('dark');
    expect(parsed.mcpServers.other).toEqual({ command: 'other' });
    expect(parsed.mcpServers.gitora).toEqual(server);
    expect(hasJsonMcpServer(result)).toBe(true);
  });

  it('removes only Gitora from JSON', () => {
    const source = upsertJsonMcpServer(JSON.stringify({ mcpServers: { other: { command: 'other' } } }), server);
    const result = JSON.parse(removeJsonMcpServer(source));

    expect(result.mcpServers).toEqual({ other: { command: 'other' } });
    expect(hasJsonMcpServer(JSON.stringify(result))).toBe(false);
  });

  it('adds and removes Gitora in Codex TOML without touching other sections', () => {
    const source = '[mcp_servers.other]\ncommand = "other"\n';
    const configured = upsertTomlMcpServer(source, server);

    expect(configured).toContain('[mcp_servers.other]');
    expect(configured).toContain('[mcp_servers.gitora]');
    expect(configured).toContain('args = ["mcp-server.cjs"]');
    expect(configured).toContain('[mcp_servers.gitora.env]');
    expect(hasTomlMcpServer(configured)).toBe(true);

    const removed = removeTomlMcpServer(configured);
    expect(removed).toContain('[mcp_servers.other]');
    expect(removed).not.toContain('[mcp_servers.gitora]');
    expect(hasTomlMcpServer(removed)).toBe(false);
  });

  it('creates a compact manual Codex template', () => {
    expect(tomlTemplate(server)).toBe('[mcp_servers.gitora]\ncommand = "C:\\\\Program Files\\\\Gitora\\\\Gitora.exe"\nargs = ["mcp-server.cjs"]\n\n[mcp_servers.gitora.env]\nELECTRON_RUN_AS_NODE = "1"\n');
  });
});
