const crypto = require('crypto');
const fs = require('fs/promises');
const net = require('net');
const path = require('path');

const API_ORIGIN = 'https://api.github.com';
const BRIDGE_VERSION = 1;
const MAX_REQUEST_SIZE = 64 * 1024;

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

function validationError(request, secret) {
  if (!request || request.secret !== secret) return 'Unauthorized MCP bridge request';
  if (request.method && request.method !== 'GET') return 'Unsupported MCP bridge method';
  if (!isAllowedMcpEndpoint(request.endpoint)) return 'Invalid MCP endpoint';
  return null;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown MCP bridge error';
}

function createMcpBridge({ metadataPath, socketPath = defaultSocketPath(metadataPath), request }) {
  if (typeof metadataPath !== 'string' || !metadataPath) throw new TypeError('metadataPath is required');
  if (typeof request !== 'function') throw new TypeError('request callback is required');

  const metadata = {
    version: BRIDGE_VERSION,
    socketPath,
    secret: crypto.randomBytes(32).toString('hex'),
  };
  let server = null;

  const send = (socket, payload) => {
    if (!socket.destroyed) socket.end(`${JSON.stringify(payload)}\n`);
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
      send(socket, { success: false, error: invalidReason });
      return;
    }

    try {
      const data = await request(parsed.endpoint);
      send(socket, { success: true, data });
    } catch (error) {
      send(socket, { success: false, error: errorMessage(error) });
    }
  };

  const handleConnection = socket => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.setTimeout(5000, () => socket.destroy());
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > MAX_REQUEST_SIZE) {
        send(socket, { success: false, error: 'MCP bridge request is too large' });
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

  async function stop() {
    const activeServer = server;
    server = null;
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
  };
}

module.exports = { createMcpBridge, isAllowedMcpEndpoint };
