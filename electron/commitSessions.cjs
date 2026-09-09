// Commit sessions (Phase 1): model + .wsb/provisioning generation.
// Runs a repo commit inside a disposable Windows Sandbox: the host downloads
// the commit archive, maps it into the VM, the VM builds and runs the app.
// Closing the sandbox wipes everything; the host keeps no build garbage.
//
// Pure logic (no Electron dependency) so it is unit-testable. Process
// management and IPC live in electron/main.cjs.

const crypto = require('crypto');
const path = require('path');
const fs = require('fs/promises');
const nodeFs = require('fs');

const SESSION_STATES = ['starting', 'running', 'stopping', 'gone'];
const RUNNABLE_EXTENSIONS = ['.csproj', '.vbproj', '.fsproj'];
const BUILDABLE_EXTENSIONS = [...RUNNABLE_EXTENSIONS, '.sln', '.slnx'];
const LAUNCH_FILE_PATTERN = /^[A-Za-z0-9._\-/ ]+$/;
// Pinned SDK for the host cache (matches the dev environment).
// SHA512 from the official release-metadata index
// (builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json).
const PINNED_DOTNET_SDK = '10.0.400';
const DOTNET_SDK_URL = `https://builds.dotnet.microsoft.com/dotnet/Sdk/${PINNED_DOTNET_SDK}/dotnet-sdk-${PINNED_DOTNET_SDK}-win-x64.zip`;
const DOTNET_SDK_SHA512 = '9b8b88590e4da131bfd0da7aa089d0fc04d5418d5f8607ec13d55dc5a17b4399afd54d496c12657fa05c6c6546dc5eab930f26ac6c50f2d3a7712c0fb378c366';
const DEFAULT_MAX_AGE_MINUTES = 240;
const DEFAULT_MEMORY_MB = 4096;

function isRunnableLaunchFile(file) {
  return RUNNABLE_EXTENSIONS.some(ext => String(file || '').toLowerCase().endsWith(ext));
}

// Validates a user-provided launch file path (repo-relative). Rejects
// absolute paths, traversal and non-buildable extensions.
function validateLaunchFile(value) {
  const raw = typeof value === 'string' ? value.trim().replace(/\\/g, '/') : '';
  if (!raw) throw new Error('Укажите файл запуска (например, src/App/App.csproj)');
  if (/^[a-zA-Z]:\//.test(raw) || raw.startsWith('/') || raw.includes('..')) {
    throw new Error('Файл запуска должен быть относительным путём внутри репозитория');
  }
  if (!LAUNCH_FILE_PATTERN.test(raw)) throw new Error('Недопустимые символы в пути файла запуска');
  const lower = raw.toLowerCase();
  if (!BUILDABLE_EXTENSIONS.some(ext => lower.endsWith(ext))) {
    throw new Error('Файл запуска: .csproj/.vbproj/.fsproj (запуск) или .sln/.slnx (только сборка)');
  }
  return raw;
}

// Picks a default launch file from a repo file listing: runnable projects
// first (shallowest), then solutions. Returns null when nothing fits.
function detectLaunchFile(files) {
  const list = Array.isArray(files) ? files.filter(name => typeof name === 'string') : [];
  const depth = (name) => name.split('/').length;
  const runnable = list
    .filter(name => RUNNABLE_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext)))
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  if (runnable[0]) return runnable[0];
  const solutions = list
    .filter(name => ['.sln', '.slnx'].some(ext => name.toLowerCase().endsWith(ext)))
    .sort((a, b) => depth(a) - depth(b) || a.localeCompare(b));
  return solutions[0] || null;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildWsb({ hostFolder, sandboxFolder = 'C:\\gitora', logonCommand, memoryMb = DEFAULT_MEMORY_MB, networking = true, extraFolders = [] }) {
  if (!hostFolder || !path.isAbsolute(hostFolder)) throw new Error('Некорректная папка сессии');
  if (!logonCommand) throw new Error('Пустая команда запуска VM');
  const memory = memoryMb === undefined ? DEFAULT_MEMORY_MB : Number(memoryMb);
  if (!Number.isInteger(memory) || memory < 1024 || memory > 32768) {
    throw new Error('Некорректный лимит памяти VM (1024–32768 МБ)');
  }
  const folders = [{ hostFolder, sandboxFolder, readOnly: false }];
  for (const extra of extraFolders) {
    if (!extra || !extra.hostFolder || !path.isAbsolute(extra.hostFolder) || !extra.sandboxFolder) {
      throw new Error('Некорректная дополнительная папка VM');
    }
    folders.push({ hostFolder: extra.hostFolder, sandboxFolder: extra.sandboxFolder, readOnly: extra.readOnly !== false });
  }
  const mapped = folders.map(folder => `    <MappedFolder>\r\n`
    + `      <HostFolder>${escapeXml(folder.hostFolder)}</HostFolder>\r\n`
    + `      <SandboxFolder>${escapeXml(folder.sandboxFolder)}</SandboxFolder>\r\n`
    + `      <ReadOnly>${folder.readOnly ? 'true' : 'false'}</ReadOnly>\r\n`
    + `    </MappedFolder>\r\n`).join('');
  return `<Configuration>\r\n`
    + `  <MemoryInMB>${memory}</MemoryInMB>\r\n`
    + `  <Networking>${networking === false ? 'Disable' : 'Enable'}</Networking>\r\n`
    + `  <MappedFolders>\r\n`
    + mapped
    + `  </MappedFolders>\r\n`
    + `  <LogonCommand>\r\n`
    + `    <Command>${escapeXml(logonCommand)}</Command>\r\n`
    + `  </LogonCommand>\r\n`
    + `</Configuration>\r\n`;
}

// Wrapper run as LogonCommand when a host SDK cache is mapped read-only:
// pre-seeds the environment so provision skips the SDK download.
function buildSdkWrapper() {
  return '@echo off\r\n'
    + 'set "DOTNET_ROOT=C:\\sdkcache"\r\n'
    + 'set "PATH=C:\\sdkcache;%PATH%"\r\n'
    + 'set DOTNET_CLI_TELEMETRY_OPTOUT=1\r\n'
    + 'set DOTNET_NOLOGO=1\r\n'
    + 'call C:\\gitora\\provision.cmd\r\n';
}

// Full session input validation + defaults. Pure and unit-tested; main.cjs
// trusts only its output.
function normalizeSessionInput(input) {
  const data = input && typeof input === 'object' ? input : {};
  const owner = typeof data.owner === 'string' ? data.owner : '';
  const repo = typeof data.repo === 'string' ? data.repo : '';
  const sha = typeof data.sha === 'string' ? data.sha : '';
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || owner === '.' || owner === '..') {
    throw new Error('Некорректное имя владельца репозитория');
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(repo) || repo === '.' || repo === '..') {
    throw new Error('Некорректное имя репозитория');
  }
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('Некорректный SHA коммита');
  const launchFile = validateLaunchFile(data.launchFile);
  if (data.memoryMb !== undefined && typeof data.memoryMb !== 'number') {
    throw new Error('Некорректный лимит памяти VM (1024–32768 МБ)');
  }
  const memoryMb = data.memoryMb === undefined ? DEFAULT_MEMORY_MB : data.memoryMb;
  if (!Number.isInteger(memoryMb) || memoryMb < 1024 || memoryMb > 32768) {
    throw new Error('Некорректный лимит памяти VM (1024–32768 МБ)');
  }
  if (data.maxAgeMinutes !== undefined && typeof data.maxAgeMinutes !== 'number') {
    throw new Error('Некорректный лимит времени сессии (5–1440 минут)');
  }
  const maxAgeMinutes = data.maxAgeMinutes === undefined ? DEFAULT_MAX_AGE_MINUTES : data.maxAgeMinutes;
  if (!Number.isInteger(maxAgeMinutes) || maxAgeMinutes < 5 || maxAgeMinutes > 1440) {
    throw new Error('Некорректный лимит времени сессии (5–1440 минут)');
  }
  return { owner, repo, sha, launchFile, memoryMb, networking: data.networking === undefined ? true : data.networking === true, maxAgeMinutes };
}

function sdkCacheDir(userDataDir) {
  return path.join(userDataDir, 'gitora-sdkcache');
}

// Parses `dotnet --list-sdks` output; true when a 10.x SDK is present
// (stable or preview).
function hasDotnet10(listSdksOutput) {
  return String(listSdksOutput || '').split('\n').some(line => /^\s*10\.\d+\.\d+(?:-[^\s[]+)?\s+\[/.test(line));
}

// Tail helper for session:log (host reads the mapped session.log).
function tailText(text, maxBytes = 65536) {
  const value = String(text || '');
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  const buf = Buffer.from(value, 'utf8');
  let start = buf.length - maxBytes;
  while (start < buf.length && (buf[start] & 0xc0) === 0x80) start += 1;
  return '…\n' + buf.slice(start).toString('utf8');
}

// Reads only the tail of a (potentially huge, guest-written) file.
async function readFileTail(filePath, maxBytes = 70000) {
  let handle = null;
  try {
    handle = await fs.open(filePath, 'r');
    const { size } = await handle.stat();
    const take = Math.min(size, maxBytes);
    const buf = Buffer.alloc(take);
    await handle.read(buf, 0, take, size - take);
    return buf.toString('utf8');
  } catch {
    return '';
  } finally {
    try {
      if (handle) await handle.close();
    } catch {}
  }
}

async function sha512OfFile(filePath) {
  const hash = crypto.createHash('sha512');
  const stream = nodeFs.createReadStream(filePath);
  try {
    for await (const chunk of stream) hash.update(chunk);
  } finally {
    stream.destroy();
  }
  return hash.digest('hex');
}

async function verifyFileSha512(filePath, expectedHex) {
  const actual = await sha512OfFile(filePath);
  return actual.toLowerCase() === String(expectedHex || '').toLowerCase();
}

// Provisioning script run once at VM logon. Installs .NET SDK when missing
// (no winget in Sandbox images), builds the launch file, runs it.
// Solutions (.sln/.slnx) are build-only; runnable projects are built AND run.
function buildProvisionScript({ launchFile, dotnetChannel = '10.0' }) {
  const file = validateLaunchFile(launchFile);
  if (!/^[0-9]+\.[0-9]+$/.test(String(dotnetChannel || ''))) throw new Error('Некорректный канал .NET SDK');
  const run = isRunnableLaunchFile(file);
  const winFile = file.replace(/\//g, '\\');
  // NOTE: no `set` inside (...) blocks: %PATH% on real machines contains
  // parentheses (e.g. `Program Files (x86)`) which would break block parsing.
  return '@echo off\r\n'
    + 'echo [%TIME%] logon start >> C:\\gitora\\session.log\r\n'
    + 'where dotnet >> C:\\gitora\\session.log 2>&1\r\n'
    + 'if not errorlevel 1 goto :have_dotnet\r\n'
    + 'echo [%TIME%] installing SDK >> C:\\gitora\\session.log\r\n'
    + `powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest https://dot.net/v1/dotnet-install.ps1 -OutFile C:\\gitora\\dotnet-install.ps1" >> C:\\gitora\\session.log 2>&1\r\n`
    + `powershell -NoProfile -ExecutionPolicy Bypass -File C:\\gitora\\dotnet-install.ps1 -Channel ${dotnetChannel} -InstallDir C:\\gitora\\dotnet >> C:\\gitora\\session.log 2>&1\r\n`
    + 'set "PATH=%PATH%;C:\\gitora\\dotnet"\r\n'
    + ':have_dotnet\r\n'
    + 'dotnet --version >> C:\\gitora\\session.log 2>&1\r\n'
    + `powershell -NoProfile -Command "Expand-Archive -LiteralPath 'C:\\gitora\\repo.zip' -DestinationPath 'C:\\gitora\\work' -Force" >> C:\\gitora\\session.log 2>&1\r\n`
    + `powershell -NoProfile -Command "$d=@(Get-ChildItem 'C:\\gitora\\work' -Directory); if ($d.Count -ne 1) { exit 1 }; $d[0].FullName | Out-File 'C:\\gitora\\srcdir.txt' -Encoding ascii" >> C:\\gitora\\session.log 2>&1\r\n`
    + 'if %ERRORLEVEL% NEQ 0 (\r\n'
    + '  echo [%TIME%] bad archive layout, expected one top folder >> C:\\gitora\\session.log\r\n'
    + '  exit /b 1\r\n'
    + ')\r\n'
    + 'for /f "delims=" %%D in (C:\\gitora\\srcdir.txt) do set SRCDIR=%%D\r\n'
    + 'if not defined SRCDIR exit /b 1\r\n'
    + `echo "[%TIME%] build start ${file}" >> C:\\gitora\\session.log\r\n`
    + (run
      ? `dotnet run --project "%SRCDIR%\\${winFile}" -c Release >> C:\\gitora\\session.log 2>&1\r\n`
      : `dotnet build "%SRCDIR%\\${winFile}" -c Release >> C:\\gitora\\session.log 2>&1\r\n`)
    + 'echo [%TIME%] exit %ERRORLEVEL% >> C:\\gitora\\session.log\r\n';
}

function sessionsRoot(baseTempDir) {
  return path.join(baseTempDir, 'gitora-sessions');
}

function sessionDir(root, id) {
  if (!/^[A-Za-z0-9-]+$/.test(String(id || ''))) throw new Error('Некорректный id сессии');
  return path.join(root, String(id));
}

function newSession({ owner, repo, sha, launchFile }) {
  return {
    id: crypto.randomUUID(),
    owner,
    repo,
    sha,
    launchFile: validateLaunchFile(launchFile),
    state: 'starting',
    createdAt: new Date().toISOString(),
  };
}

// PID liveness without dependencies.
function isAlive(pid) {
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 0) return false;
  try {
    process.kill(id, 0);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  BUILDABLE_EXTENSIONS,
  DEFAULT_MAX_AGE_MINUTES,
  DEFAULT_MEMORY_MB,
  DOTNET_SDK_SHA512,
  DOTNET_SDK_URL,
  PINNED_DOTNET_SDK,
  RUNNABLE_EXTENSIONS,
  SESSION_STATES,
  buildProvisionScript,
  buildSdkWrapper,
  buildWsb,
  detectLaunchFile,
  escapeXml,
  hasDotnet10,
  isAlive,
  isRunnableLaunchFile,
  newSession,
  normalizeSessionInput,
  readFileTail,
  sdkCacheDir,
  sessionDir,
  sessionsRoot,
  sha512OfFile,
  tailText,
  validateLaunchFile,
  verifyFileSha512,
};
