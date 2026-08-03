const net = require('net');

const HEALTH_ENDPOINT = '/__gitora__/health';
const BRIDGE_SHUTDOWN_CODE = 'BRIDGE_SHUTDOWN';
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

function asError(error, fallback = 'Gitora MCP bridge unavailable.') {
  return error instanceof Error ? error : new Error(fallback);
}

class McpConnectionManager {
  constructor({
    readBridgeMetadataInfos,
    clientId = 'manual',
    onLog = () => {},
    onBridgeShutdown = () => {},
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  }) {
    if (typeof readBridgeMetadataInfos !== 'function') throw new TypeError('readBridgeMetadataInfos callback is required');
    this.readBridgeMetadataInfos = readBridgeMetadataInfos;
    this.clientId = clientId;
    this.onLog = onLog;
    this.onBridgeShutdown = onBridgeShutdown;
    this.requestTimeoutMs = requestTimeoutMs;
    this.socket = null;
    this.session = null;
    this.connectPromise = null;
    this.pending = new Map();
    this.nextRequestId = 1;
    this.closed = false;
    this.shuttingDown = false;
  }

  log(event, details = {}) {
    try {
      void this.onLog(event, details);
    } catch {}
  }

  getSessionId() {
    return this.session?.metadata?.sessionId || this.session?.metadata?.secret?.slice(0, 16) || '';
  }

  getMetadataPath() {
    return this.session?.metadataPath || '';
  }

  isConnected() {
    return Boolean(this.socket && !this.socket.destroyed && this.socket.writable && this.session);
  }

  async connect() {
    if (this.closed) throw new Error('Gitora MCP connection manager is closed.');
    if (this.isConnected()) return this.session;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.connectToBridge()
      .finally(() => {
        this.connectPromise = null;
      });
    return this.connectPromise;
  }

  async connectToBridge() {
    const candidates = await this.readBridgeMetadataInfos();
    if (!candidates.length) throw new Error('Gitora session bridge is not running. Open Gitora first.');

    const preferredPath = this.session?.metadataPath;
    const orderedCandidates = [...candidates].sort((left, right) => {
      if (left.metadataPath === preferredPath) return -1;
      if (right.metadataPath === preferredPath) return 1;
      return 0;
    });

    this.log('mcp_session_creating', { client: this.clientId });
    let lastError = null;
    for (const candidate of orderedCandidates) {
      try {
        await this.openSocket(candidate);
        this.session = candidate;
        await this.sendRequest(HEALTH_ENDPOINT);
        this.log('mcp_session_created', {
          client: this.clientId,
          metadataPath: candidate.metadataPath,
          sessionId: this.getSessionId(),
          created: candidate.metadata.createdAt || '',
          active: true,
        });
        this.log('mcp_connected', {
          client: this.clientId,
          metadataPath: candidate.metadataPath,
          sessionId: this.getSessionId(),
        });
        return candidate;
      } catch (error) {
        lastError = asError(error);
        this.dropSocket(lastError, { logConnectionLost: false });
      }
    }
    throw lastError || new Error('Gitora session bridge is not reachable.');
  }

  openSocket(candidate) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(candidate.metadata.socketPath);
      let connected = false;
      let settled = false;
      let buffer = '';

      const failBeforeConnect = error => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(asError(error));
      };

      socket.setEncoding('utf8');
      socket.setKeepAlive(true);
      socket.setTimeout(0);
      socket.on('data', chunk => {
        buffer += chunk;
        let lineEnd = buffer.indexOf('\n');
        while (lineEnd !== -1) {
          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);
          if (line) this.handleMessage(line);
          lineEnd = buffer.indexOf('\n');
        }
      });
      socket.once('connect', () => {
        connected = true;
        settled = true;
        this.socket = socket;
        resolve();
      });
      socket.on('error', error => {
        if (!connected) failBeforeConnect(error);
        else this.handleSocketFailure(error);
      });
      socket.on('close', () => {
        if (!connected) failBeforeConnect(new Error('Gitora session bridge closed before connecting.'));
        else this.handleSocketFailure(new Error('Gitora session bridge connection closed.'));
      });
    });
  }

  handleMessage(rawMessage) {
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      this.handleSocketFailure(new Error('Invalid response from Gitora session bridge.'));
      return;
    }

    if (message.code === BRIDGE_SHUTDOWN_CODE) {
      const error = new Error(message.error || 'Gitora MCP bridge is shutting down.');
      error.code = BRIDGE_SHUTDOWN_CODE;
      const sessionId = this.getSessionId();
      const created = this.session?.metadata?.createdAt || '';
      this.shuttingDown = true;
      this.closed = true;
      this.dropSocket(error, { logConnectionLost: false });
      this.log('mcp_session_state', {
        client: this.clientId,
        sessionId,
        created,
        active: false,
        disconnected: new Date().toISOString(),
      });
      this.log('mcp_session_closed', { client: this.clientId, reason: error.message, sessionId });
      void this.onBridgeShutdown(error);
      return;
    }

    const pending = this.pending.get(String(message.id ?? ''));
    if (!pending) return;
    this.pending.delete(String(message.id));
    clearTimeout(pending.timer);
    if (message.success) pending.resolve(message.data);
    else {
      const error = new Error(message.error || 'Gitora session bridge request failed.');
      if (message.code) error.code = message.code;
      if (message.status) error.status = message.status;
      if (message.requiredPermission) error.requiredPermission = message.requiredPermission;
      pending.reject(error);
    }
  }

  handleSocketFailure(error) {
    if (this.shuttingDown || this.closed) return;
    if (this.socket) this.dropSocket(asError(error), { logConnectionLost: true });
  }

  dropSocket(error, { logConnectionLost = false } = {}) {
    const socket = this.socket;
    const sessionId = this.getSessionId();
    const created = this.session?.metadata?.createdAt || '';
    this.socket = null;
    this.session = null;
    if (logConnectionLost) {
      this.log('mcp_connection_lost', { client: this.clientId, error: error.message, sessionId });
      this.log('mcp_session_state', {
        client: this.clientId,
        sessionId,
        created,
        active: false,
        disconnected: new Date().toISOString(),
      });
    }
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (socket && !socket.destroyed) socket.destroy();
  }

  sendRequest(endpoint, options = {}) {
    if (!this.isConnected()) return Promise.reject(new Error('Gitora session bridge is not connected.'));
    const id = String(this.nextRequestId++);
    const request = {
      id,
      secret: this.session.metadata.secret,
      endpoint,
      client: this.clientId,
    };
    if (options.method && options.method !== 'GET') request.method = options.method;
    if (options.body !== undefined) request.body = JSON.stringify(options.body);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Gitora session bridge timed out after ${this.requestTimeoutMs}ms.`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.write(`${JSON.stringify(request)}\n`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(asError(error));
        this.handleSocketFailure(error);
      }
    });
  }

  async request(endpoint, options = {}) {
    await this.connect();
    return this.sendRequest(endpoint, options);
  }

  async reconnect(reason) {
    if (this.closed) return false;
    this.log('mcp_reconnecting', {
      client: this.clientId,
      reason: asError(reason).message,
    });
    this.dropSocket(asError(reason), { logConnectionLost: false });
    try {
      await this.connect();
      return true;
    } catch (error) {
      this.log('mcp_reconnect_failed', { client: this.clientId, error: asError(error).message });
      return false;
    }
  }

  close(reason = 'MCP session closed by client.') {
    if (this.closed && !this.socket) return;
    const sessionId = this.getSessionId();
    const created = this.session?.metadata?.createdAt || '';
    this.closed = true;
    this.shuttingDown = true;
    this.dropSocket(asError(reason), { logConnectionLost: false });
    this.log('mcp_session_state', {
      client: this.clientId,
      sessionId,
      created,
      active: false,
      disconnected: new Date().toISOString(),
    });
    this.log('mcp_session_closed', { client: this.clientId, reason: asError(reason).message, sessionId });
  }
}

module.exports = { BRIDGE_SHUTDOWN_CODE, McpConnectionManager };
