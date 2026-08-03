const crypto = require('crypto');
const fs = require('fs/promises');
const net = require('net');
const path = require('path');

const API_ORIGIN = 'https://api.github.com';
const BRIDGE_VERSION = 1;
const MAX_REQUEST_SIZE = 64 * 1024;
const HEALTH_ENDPOINT = '/__gitora__/health';

const WRITE_ENDPOINTS = [
  { method: 'POST', pattern: /^\/repos\/[^/]+\/[^/]+\/git\/blobs$/ },
  { method: 'POST', pattern: /^\/repos\/[^/]+\/[^/]+\/git\/trees$/ },
  { method: 'POST', pattern: /^\/repos\/[^/]+\/[^/]+\/git\/commits$/ },
  { method: 'POST', pattern: /^\/repos\/[^/]+\/[^/]+\/git\/refs$/ },
  { method: 'PATCH', pattern: /^\/repos\/[^/]+\/[^/]+\/git\/refs\/heads\/.+$/ },
  { method: 'PUT', pattern: /^\/repos\/[^/]+\/[^/]+\/contents\/.+$/ },
  { method: 'POST', pattern: /^\/repos\/[^/]+\/[^/]+\/issues$/ },
  { method: 'POST', pattern: /^\/repos\/[^/]+\/[^/]+\/issues\/\d+\/comments$/ },
  { method: 'POST', pattern: /^\/repos\/[^/]+\/[^/]+\/pulls$/ },
];

function defaultSocketPath(metadataPath) {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\gitora-mcp-${crypto.createHash('sha256').update(metadataPath).digest('hex').slice(0, 24)}`;
  }
  return path.join(path.dirname(metadataPath), 'mcp.sock');
}

function isAllowedMcpEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint.startsWith('/') || endpoint.startsWith('//')) return false;
  if (endpoint.includes('\\') || endpoint.includes('\r') || endpoint.includes('\n')) return false;

  try {
    return new URL(endpoint, API_ORIGIN).origin === API_ORIGIN;
  } catch {
    return false;
  }
}

function isAllowedMcpWrite(method, endpoint) {
  return WRITE_ENDPOINTS.some(candidate => candidate.method === method && candidate.pattern.test(endpoint));
}

function validationError(request, secret) {
  if (!request || request.secret !== secret) return 'Unauthorized MCP bridge request';
  const method = request.method || 'GET';
  if (!['GET', 'POST', 'PATCH', 'PUT'].includes(method)) return 'Unsupported MCP bridge method';
  if (request.endpoint !== HEALTH_ENDPOINT && !isAllowedMcpEndpoint(request.endpoint)) return 'Invalid MCP endpoint';
  if (request.endpoint === HEALTH_ENDPOINT && method !== 'GET') return 'Invalid MCP health method';
  if (method !== 'GET' && !isAllowedMcpWrite(method, request.endpoint)) return 'Invalid MCP write endpoint';
  if (request.body !== undefined && typeof request.body !== 'string') return 'Invalid MCP request body';
  if (request.client !== undefined && (typeof request.client !== 'string' || !/^[a-z0-9-]{1,32}$/i.test(request.client))) return 'Invalid MCP client';
  return null;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown MCP bridge error';
}

function errorDetails(error) {
  return {
    ...(error?.code ? { code: error.code } : {}),
    ...(error?.requiredPermission ? { requiredPermission: error.requiredPermission } : {}),
    ...(error?.status ? { status: error.status } : {}),
  };
}

function createMcpBridge({ metadataPath, socketPath = defaultSocketPath(metadataPath), request, isWriteAllowed = () => false, onRequest, onRequestStart, onConnection, onDisconnect }) {
  if (typeof metadataPath !== 'string' || !metadataPath) throw new TypeError('metadataPath is required');
  if (typeof request !== 'function') throw new TypeError('request callback is required');

  const metadata = {
    version: BRIDGE_VERSION,
    socketPath,
    secret: crypto.randomBytes(32).toString('hex'),
    sessionId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  let server = null;
  const connections = new Set();

  const send = (socket, payload, requestId) => {
    if (socket.destroyed || socket.writableEnded) return;
    const response = requestId === undefined ? payload : { ...payload, id: requestId };
    socket.write(`${JSON.stringify(response)}\n`);
  };

  const handleRequest = async (socket, rawRequest) => {
    let parsed;
    try {
      parsed = JSON.parse(rawRequest);
    } catch {
      send(socket, { success: false, error: 'Invalid MCP bridge payload' });
      return;
    }

    const invalidReason = validationError(parsed, metadata.secret);
    if (invalidReason) {
      send(socket, { success: false, error: invalidReason }, parsed.id);
      return;
    }

    const startedAt = Date.now();
    onRequestStart?.({
      endpoint: parsed.endpoint,
      method: parsed.method || 'GET',
      client: parsed.client,
      requestId: parsed.id,
    });
    if (parsed.endpoint === HEALTH_ENDPOINT) {
      onRequest?.({
        endpoint: HEALTH_ENDPOINT,
        method: 'GET',
        client: parsed.client,
        success: true,
        heartbeat: true,
        durationMs: Date.now() - startedAt,
      });
      send(socket, { success: true, data: { bridge: 'gitora', pid: process.pid, sessionId: metadata.sessionId } }, parsed.id);
      return;
    }

    if (parsed.method && parsed.method !== 'GET' && !isWriteAllowed(parsed)) {
      const error = 'MCP write approval is required. Enable MCP writes in Gitora first.';
      onRequest?.({
        endpoint: parsed.endpoint,
        method: parsed.method,
        client: parsed.client,
        success: false,
        durationMs: Date.now() - startedAt,
        error,
        code: 'MCP_WRITE_APPROVAL_REQUIRED',
      });
      send(socket, { success: false, error, code: 'MCP_WRITE_APPROVAL_REQUIRED' }, parsed.id);
      return;
    }

    try {
      const options = { method: parsed.method || 'GET' };
      if (parsed.body !== undefined) options.body = parsed.body;
      const data = await request(parsed.endpoint, options);
      onRequest?.({
        endpoint: parsed.endpoint,
        method: options.method,
        client: parsed.client,
        success: true,
        durationMs: Date.now() - startedAt,
      });
      send(socket, { success: true, data }, parsed.id);
    } catch (error) {
      onRequest?.({
        endpoint: parsed.endpoint,
        method: parsed.method || 'GET',
        client: parsed.client,
        success: false,
        durationMs: Date.now() - startedAt,
        error: errorMessage(error),
        ...errorDetails(error),
      });
      send(socket, { success: false, error: errorMessage(error), ...errorDetails(error) }, parsed.id);
    }
  };

  const handleConnection = socket => {
    connections.add(socket);
    onConnection?.();
    socket.once('close', () => {
      connections.delete(socket);
      onDisconnect?.();
    });
    let buffer = '';
    socket.setEncoding('utf8');
    socket.setKeepAlive(true);
    socket.setTimeout(0);
    socket.on('error', () => {});
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > MAX_REQUEST_SIZE) {
        send(socket, { success: false, error: 'MCP bridge request is too large' });
        socket.destroy();
        return;
      }

      let lineEnd = buffer.indexOf('\n');
      while (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd).trim();
        buffer = buffer.slice(lineEnd + 1);
        if (line) void handleRequest(socket, line);
        lineEnd = buffer.indexOf('\n');
      }
    });
  };

  async function start() {
    if (server?.listening) return metadata;

    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.rm(metadataPath, { force: true });
    server = net.createServer(handleConnection);

    try {
      await new Promise((resolve, reject) => {
        const onError = error => {
          server?.removeListener('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server?.removeListener('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(socketPath);
      });
      await fs.writeFile(metadataPath, JSON.stringify(metadata), { encoding: 'utf8', mode: 0o600 });
      return metadata;
    } catch (error) {
      await stop();
      throw error;
    }
  }

  async function stop({ notifyClients = true } = {}) {
    const activeServer = server;
    server = null;
    for (const socket of connections) {
      if (notifyClients) {
        send(socket, {
          success: false,
          error: 'Gitora MCP bridge is shutting down.',
          code: 'BRIDGE_SHUTDOWN',
        });
        socket.end();
      } else socket.destroy();
    }
    connections.clear();
    if (activeServer) {
      await new Promise(resolve => activeServer.close(() => resolve()));
    }
    await fs.rm(metadataPath, { force: true });
    if (process.platform !== 'win32') await fs.rm(socketPath, { force: true });
  }

  return {
    start,
    stop,
    metadata: { ...metadata },
    isRunning: () => Boolean(server?.listening),
  };
}

module.exports = { HEALTH_ENDPOINT, createMcpBridge, isAllowedMcpEndpoint };
