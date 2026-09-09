// Commit sessions (Phase 1): model + .wsb/provisioning generation.
// Runs a repo commit inside a disposable Windows Sandbox: the host downloads
// the commit archive, maps it into the VM, the VM builds and runs the app.
// Closing the sandbox wipes everything; the host keeps no build garbage.
//
// Pure logic (no Electron dependency) so it is unit-testable. Process
// management and IPC live in electron/main.cjs.

const crypto = require('crypto');
const path = require('path');

const SESSION_STATES = ['starting', 'running', 'stopping', 'gone'];
const RUNNABLE_EXTENSIONS = ['.csproj', '.vbproj', '.fsproj'];
const BUILDABLE_EXTENSIONS = [...RUNNABLE_EXTENSIONS, '.sln', '.slnx'];
const LAUNCH_FILE_PATTERN = /^[A-Za-z0-9._\-/ ]+$/;

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

function buildWsb({ hostFolder, sandboxFolder = 'C:\\gitora', logonCommand, memoryMb = 4096 }) {
  if (!hostFolder || !path.isAbsolute(hostFolder)) throw new Error('Некорректная папка сессии');
  if (!logonCommand) throw new Error('Пустая команда запуска VM');
  const memory = memoryMb === undefined ? 4096 : Number(memoryMb);
  if (!Number.isInteger(memory) || memory < 1024 || memory > 32768) {
    throw new Error('Некорректный лимит памяти VM (1024–32768 МБ)');
  }
  return `<Configuration>\r\n`
    + `  <MemoryInMB>${memory}</MemoryInMB>\r\n`
    + `  <MappedFolders>\r\n`
    + `    <MappedFolder>\r\n`
    + `      <HostFolder>${escapeXml(hostFolder)}</HostFolder>\r\n`
    + `      <SandboxFolder>${escapeXml(sandboxFolder)}</SandboxFolder>\r\n`
    + `      <ReadOnly>false</ReadOnly>\r\n`
    + `    </MappedFolder>\r\n`
    + `  </MappedFolders>\r\n`
    + `  <LogonCommand>\r\n`
    + `    <Command>${escapeXml(logonCommand)}</Command>\r\n`
    + `  </LogonCommand>\r\n`
    + `</Configuration>\r\n`;
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
  RUNNABLE_EXTENSIONS,
  SESSION_STATES,
  buildProvisionScript,
  buildWsb,
  detectLaunchFile,
  escapeXml,
  isAlive,
  isRunnableLaunchFile,
  newSession,
  sessionDir,
  sessionsRoot,
  validateLaunchFile,
};
