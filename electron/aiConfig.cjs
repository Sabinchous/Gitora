const MCP_SERVER_KEY = 'gitora';

function mcpServerDefinition(command, args, env = {}) {
  return {
    command,
    args: [...args],
    ...(env && Object.keys(env).length > 0 ? { env: { ...env } } : {}),
  };
}

function readJsonConfig(text) {
  if (!text.trim()) return {};
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function upsertJsonMcpServer(text, server) {
  const config = readJsonConfig(text);
  const mcpServers = config.mcpServers && typeof config.mcpServers === 'object' && !Array.isArray(config.mcpServers)
    ? config.mcpServers
    : {};
  return `${JSON.stringify({ ...config, mcpServers: { ...mcpServers, [MCP_SERVER_KEY]: server } }, null, 2)}\n`;
}

function removeJsonMcpServer(text) {
  const config = readJsonConfig(text);
  if (!config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) return `${JSON.stringify(config, null, 2)}\n`;
  const { [MCP_SERVER_KEY]: _removed, ...otherServers } = config.mcpServers;
  return `${JSON.stringify({ ...config, mcpServers: otherServers }, null, 2)}\n`;
}

function hasJsonMcpServer(text) {
  try {
    const config = readJsonConfig(text);
    return Boolean(config.mcpServers && typeof config.mcpServers === 'object' && config.mcpServers[MCP_SERVER_KEY]);
  } catch {
    return false;
  }
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function removeTomlMcpServer(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === `[mcp_servers.${MCP_SERVER_KEY}]`);
  if (start === -1) return text;

  let end = start + 1;
  while (end < lines.length) {
    const section = lines[end].trim();
    if (/^\s*\[[^\]]+\]\s*$/.test(section) && !section.startsWith(`[mcp_servers.${MCP_SERVER_KEY}`)) break;
    end += 1;
  }
  lines.splice(start, end - start);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + (lines.length ? '\n' : '');
}

function upsertTomlMcpServer(text, server) {
  const base = removeTomlMcpServer(text).trimEnd();
  const block = [
    `[mcp_servers.${MCP_SERVER_KEY}]`,
    `command = ${tomlString(server.command)}`,
    `args = ${JSON.stringify(server.args)}`,
    ...(server.env && Object.keys(server.env).length > 0 ? [
      '',
      `[mcp_servers.${MCP_SERVER_KEY}.env]`,
      ...Object.entries(server.env).map(([name, value]) => `${name} = ${tomlString(value)}`),
    ] : []),
  ].join('\n');
  return `${base ? `${base}\n\n` : ''}${block}\n`;
}

function hasTomlMcpServer(text) {
  return text.split(/\r?\n/).some(line => line.trim() === `[mcp_servers.${MCP_SERVER_KEY}]`);
}

function jsonTemplate(server) {
  return `${JSON.stringify({ mcpServers: { [MCP_SERVER_KEY]: server } }, null, 2)}\n`;
}

function tomlTemplate(server) {
  return upsertTomlMcpServer('', server);
}

module.exports = {
  mcpServerDefinition,
  upsertJsonMcpServer,
  removeJsonMcpServer,
  hasJsonMcpServer,
  upsertTomlMcpServer,
  removeTomlMcpServer,
  hasTomlMcpServer,
  jsonTemplate,
  tomlTemplate,
};
