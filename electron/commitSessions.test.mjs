import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  buildNodeWrapper,
  buildProvisionScript,
  buildSdkWrapper,
  buildWsb,
  detectLaunchFile,
  detectRuntime,
  hasDotnet10,
  isAlive,
  newSession,
  nodeCacheDir,
  nodeCacheWritableDir,
  nodeMajorOk,
  normalizeSessionInput,
  parsePackageJson,
  readFileTail,
  removeNodeArtifacts,
  sanitizeLaunchCommand,
  sdkCacheDir,
  sessionDir,
  sha256OfFile,
  sha512OfFile,
  tailText,
  validateLaunchFile,
  verifyFileSha256,
  verifyFileSha512,
} = require('./commitSessions.cjs');

describe('launch file handling', () => {
  it('accepts repo-relative buildable paths and rejects traversal', () => {
    expect(validateLaunchFile('src/App/App.csproj')).toBe('src/App/App.csproj');
    expect(validateLaunchFile('App.slnx')).toBe('App.slnx');
    for (const bad of ['', 'C:\\app\\a.csproj', '/abs/a.csproj', '../evil.csproj', 'a/b/../../x.csproj', 'run.exe', 'note.txt']) {
      expect(() => validateLaunchFile(bad)).toThrow();
    }
  });

  it('prefers runnable projects over solutions, shallowest first', () => {
    expect(detectLaunchFile(['Deep/Nested/App.slnx', 'src/App/App.csproj', 'README.md'])).toBe('src/App/App.csproj');
    expect(detectLaunchFile(['App.slnx'])).toBe('App.slnx');
    expect(detectLaunchFile(['README.md'])).toBeNull();
  });
});

describe('.wsb generation', () => {
  it('embeds escaped folders and the logon command', () => {
    const wsb = buildWsb({ hostFolder: 'C:\\tmp\\s&1', logonCommand: 'cmd.exe /c "a&b"' });
    expect(wsb).toContain('<HostFolder>C:\\tmp\\s&amp;1</HostFolder>');
    expect(wsb).toContain('<SandboxFolder>C:\\gitora</SandboxFolder>');
    expect(wsb).toContain('cmd.exe /c &quot;a&amp;b&quot;');
    expect(wsb).toContain('<MemoryInMB>4096</MemoryInMB>');
    expect(() => buildWsb({ hostFolder: 'relative', logonCommand: 'x' })).toThrow();
  });
});

describe('provision script generation', () => {
  it('runs runnable projects and only builds solutions', () => {
    const run = buildProvisionScript({ launchFile: 'src/App/App.csproj' });
    expect(run).toContain('dotnet run --project');
    expect(run).toContain('"%SRCDIR%\\src\\App\\App.csproj"');
    expect(run).toContain('dotnet-install.ps1');
    expect(run).toContain('Expand-Archive');
    const buildOnly = buildProvisionScript({ launchFile: 'App.slnx' });
    expect(buildOnly).toContain('dotnet build');
    expect(buildOnly).not.toContain('dotnet run');
    expect(buildOnly).not.toContain('-o "C:\\gitora\\out"');
  });

  it('avoids set-in-parens, guards the archive layout and validates options', () => {
    const run = buildProvisionScript({ launchFile: 'src/App/App.csproj' });
    expect(run).toContain('if not errorlevel 1 goto :have_dotnet');
    expect(run).toContain(':have_dotnet');
    expect(run).toContain('if ($d.Count -ne 1)');
    expect(run).toContain('if not defined SRCDIR exit /b 1');
    expect(() => buildProvisionScript({ launchFile: 'a.csproj', dotnetChannel: '10; evil' })).toThrow();
    expect(() => buildWsb({ hostFolder: 'C:\\t', logonCommand: 'x', memoryMb: 512 })).toThrow();
    expect(() => buildWsb({ hostFolder: 'C:\\t', logonCommand: 'x', memoryMb: 'lots' })).toThrow();
    expect(buildWsb({ hostFolder: 'C:\\t', logonCommand: 'x', memoryMb: 8192 })).toContain('<MemoryInMB>8192</MemoryInMB>');
  });
});

describe('session model', () => {
  it('creates identifiable starting sessions and safe dirs', () => {
    const session = newSession({ owner: 'a', repo: 'b', sha: 'abc1234', launchFile: 'a.csproj' });
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.state).toBe('starting');
    expect(sessionDir('C:\\t', session.id)).toContain(session.id);
    expect(() => sessionDir('C:\\t', '../evil')).toThrow();
    expect(isAlive(process.pid)).toBe(true);
    expect(isAlive(99999999)).toBe(false);
  });
});

describe('session input normalization (phase 2)', () => {
  const good = { owner: 'acme', repo: 'demo', sha: 'a'.repeat(40), launchFile: 'src/App.csproj' };

  it('applies defaults and accepts explicit options', () => {
    expect(normalizeSessionInput(good)).toMatchObject({
      owner: 'acme', launchFile: 'src/App.csproj', memoryMb: 4096, networking: true, maxAgeMinutes: 240,
    });
    expect(normalizeSessionInput({ ...good, memoryMb: 8192, networking: false, maxAgeMinutes: 60 }))
      .toMatchObject({ memoryMb: 8192, networking: false, maxAgeMinutes: 60 });
  });

  it('rejects bad owners, repos, shas and options', () => {
    expect(() => normalizeSessionInput({ ...good, owner: '..' })).toThrow();
    expect(() => normalizeSessionInput({ ...good, repo: '' })).toThrow();
    expect(() => normalizeSessionInput({ ...good, sha: 'abc1234' })).toThrow();
    expect(() => normalizeSessionInput({ ...good, memoryMb: 512 })).toThrow();
    expect(() => normalizeSessionInput({ ...good, maxAgeMinutes: 2000 })).toThrow();
  });

  it('maps an sdk cache, detects dotnet 10 and tails logs', () => {
    expect(sdkCacheDir('C:\\u')).toBe('C:\\u\\gitora-sdkcache');
    expect(hasDotnet10('10.0.400 [C:\\Program Files\\dotnet\\sdk]\n9.0.100 [x]')).toBe(true);
    expect(hasDotnet10('9.0.100 [x]')).toBe(false);
    expect(tailText('abcdef', 4)).toContain('ef');
    expect(buildSdkWrapper()).toContain('C:\\sdkcache');
    const wsb = buildWsb({
      hostFolder: 'C:\\s', logonCommand: 'x', networking: false,
      extraFolders: [{ hostFolder: 'C:\\sdk', sandboxFolder: 'C:\\sdkcache' }],
    });
    expect(wsb).toContain('<Networking>Disable</Networking>');
    expect(wsb).toContain('<SandboxFolder>C:\\sdkcache</SandboxFolder>');
    expect(wsb).toContain('<ReadOnly>true</ReadOnly>');
    expect(() => buildWsb({ hostFolder: 'C:\\s', logonCommand: 'x', extraFolders: [{ hostFolder: 'rel' }] })).toThrow();
  });
});

describe('tail and hash file helpers', () => {
  it('takes exact tails and never splits multibyte chars', () => {
    expect(tailText('abcdef', 4)).toBe('…\ncdef');
    expect(tailText('abc', 99)).toBe('abc');
    // 2-byte 'é' cut mid-char must shift to a boundary, never emit U+FFFD.
    const text = `x${'é'.repeat(10)}y`;
    const tailed = tailText(text, 5);
    expect(tailed.startsWith('…\n')).toBe(true);
    expect(tailed).not.toContain('�');
  });

  it('reads only the tail and verifies sha512', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitora-tail-'));
    try {
      const file = path.join(dir, 'log.txt');
      await fs.writeFile(file, '0123456789ABCDEFGHIJ', 'utf8');
      expect(await readFileTail(file, 6)).toBe('EFGHIJ');
      expect(await readFileTail(path.join(dir, 'missing.txt'), 6)).toBe('');
      const bin = path.join(dir, 'a.bin');
      await fs.writeFile(bin, 'abc', 'utf8');
      expect(await sha512OfFile(bin)).toBe(
        'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
      );
      expect(await verifyFileSha512(bin, 'DDAF35A193617ABACC417349AE20413112E6FA4E89A97EA20A9EEEE64B55D39A2192992A274FC1A836BA3C23A3FEEBBD454D4423643CE80E2A9AC94FA54CA49F')).toBe(true);
      expect(await verifyFileSha512(bin, '0'.repeat(128))).toBe(false);
      expect(await sha256OfFile(bin)).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
      expect(await verifyFileSha256(bin, 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD')).toBe(true);
      expect(await verifyFileSha256(bin, '0'.repeat(64))).toBe(false);
      expect(await verifyFileSha256(bin, 'xyz')).toBe(false);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('wrapper and list-sdks parsing', () => {
  it('pre-seeds dotnet env and calls provision', () => {
    const wrapper = buildSdkWrapper();
    expect(wrapper).toContain('set "DOTNET_ROOT=C:\\sdkcache"');
    expect(wrapper).toContain('set "PATH=C:\\sdkcache;%PATH%"');
    expect(wrapper).toContain('DOTNET_CLI_TELEMETRY_OPTOUT=1');
    expect(wrapper).toContain('call C:\\gitora\\provision.cmd');
  });

  it('parses CRLF output and preview versions', () => {
    expect(hasDotnet10('10.0.400 [C:\\sdk]\r\n9.0.100 [x]\r\n')).toBe(true);
    expect(hasDotnet10('10.0.400-preview.1 [C:\\sdk]\r\n')).toBe(true);
    expect(hasDotnet10('9.0.100 [x]\r\n')).toBe(false);
  });

  it('rejects sloppy option types', () => {
    const good = { owner: 'a', repo: 'b', sha: 'c'.repeat(40), launchFile: 'a.csproj' };
    expect(() => normalizeSessionInput({ ...good, maxAgeMinutes: 60.5 })).toThrow();
    expect(() => normalizeSessionInput({ ...good, memoryMb: '8192' })).toThrow();
    expect(normalizeSessionInput({ ...good, networking: 'false' }).networking).toBe(false);
    expect(normalizeSessionInput(good).networking).toBe(true);
  });
});

describe('runtime auto-detection', () => {
  const electronPkg = JSON.stringify({
    name: 'gitora', main: 'electron/main.cjs',
    scripts: { dev: 'vite', build: 'vite build', start: 'electron .' },
    dependencies: { react: '^19.0.0' }, devDependencies: { electron: '^42.0.0' },
  });

  it('detects node/electron repos and suggests a command', () => {
    const found = detectRuntime(['myrepo-abc123/package.json', 'myrepo-abc123/electron/main.cjs'], electronPkg);
    expect(found).toMatchObject({ kind: 'node', packagePath: 'package.json', packageDir: '', electron: true });
    expect(found.command).toBe('npm start');
    expect(found.buildFirst).toBe(true);
    expect(found.scripts).toContain('build');
  });

  it('handles nested packages, broken json and non-node repos', () => {
    const nested = detectRuntime(['r-1/sub/package.json'], JSON.stringify({ scripts: { dev: 'vite' } }));
    expect(nested).toMatchObject({ kind: 'node', packageDir: 'sub', command: 'npm run dev', buildFirst: false });
    const broken = detectRuntime(['r-1/package.json'], 'not json{{{');
    expect(broken).toMatchObject({ kind: 'node', command: null });
    const dotnet = detectRuntime(['r-1/src/App.csproj'], null);
    expect(dotnet).toEqual({ kind: 'dotnet', launchFile: 'src/App.csproj' });
    expect(detectRuntime(['r-1/README.md'], null)).toEqual({ kind: 'unknown' });
  });

  it('parses package.json safely', () => {
    expect(parsePackageJson('{{{')).toBeNull();
    expect(parsePackageJson('[]')).toBeNull();
    expect(parsePackageJson(JSON.stringify({ scripts: { build: 42 } }))).toMatchObject({ scripts: {} });
    expect(parsePackageJson('﻿' + JSON.stringify({ name: 'x', scripts: { start: 'node .' } }))).toMatchObject({
      name: 'x',
      scripts: { start: 'node .' },
    });
  });

  it('sanitizes launch commands', () => {
    expect(sanitizeLaunchCommand('  npx electron .  ')).toBe('npx electron .');
    for (const bad of ['', 'a && b', 'a | b', 'a > b', 'say "hi"', 'a`b`', 'a\nb', 'x'.repeat(501)]) {
      expect(() => sanitizeLaunchCommand(bad)).toThrow();
    }
  });

  it('generates a node provision profile', () => {
    const script = buildProvisionScript({ launchCommand: 'npx electron .', packageDir: '', buildFirst: true });
    expect(script).toContain('where node');
    expect(script).toContain('node-v');
    expect(script).toContain('npm ci --no-audit --no-fund');
    expect(script).toContain('call npm run build');
    expect(script).toContain('npx electron .');
    expect(script).toContain('apprun.log');
    expect(script).not.toContain('cd /d \\"');
    expect(script).toContain('/D "%SRCDIR%"');
    expect(script).toContain('vc_redist.x64.exe');
    expect(script).toContain('npm install failed');
    expect(script).not.toContain('dotnet');
    expect(() => buildProvisionScript({})).toThrow();
    expect(() => buildProvisionScript({ launchCommand: 'a && b' })).toThrow();
  });

  it('routes runtimes in normalizeSessionInput', () => {
    const base = { owner: 'a', repo: 'b', sha: 'c'.repeat(40) };
    expect(normalizeSessionInput({ ...base, launchFile: 'a.csproj' }).runtime).toBe('dotnet');
    expect(normalizeSessionInput({ ...base, launchCommand: 'npm start' }).runtime).toBe('node');
    expect(normalizeSessionInput({ ...base, runtime: 'node', launchCommand: 'npm start' }).runtime).toBe('node');
    expect(() => normalizeSessionInput({ ...base, runtime: 'node' })).toThrow();
    expect(() => normalizeSessionInput({ ...base, runtime: 'python', launchCommand: 'x' })).toThrow();
    expect(() => normalizeSessionInput({ ...base, launchCommand: 'npm start', packageDir: '../evil' })).toThrow();
  });

  it('exposes node cache paths and wrapper', () => {
    expect(nodeCacheDir('C:\\u')).toBe('C:\\u\\gitora-nodecache');
    expect(nodeCacheWritableDir('C:\\u')).toBe('C:\\u\\gitora-nodecache\\writable');
    const wrapper = buildNodeWrapper();
    expect(wrapper).toContain('NPM_CONFIG_CACHE=C:\\nodecache\\writable\\npm-cache');
    expect(wrapper).toContain('electron_config_cache=C:\\nodecache\\writable\\electron-cache');
    expect(wrapper).toContain('set "PATH=C:\\nodecache\\node;%PATH%"');
    expect(wrapper).toContain('call C:\\gitora\\provision.cmd');
  });

  it('gates node versions and cleans only node artifacts', async () => {
    expect(nodeMajorOk('v24.19.0')).toBe(true);
    expect(nodeMajorOk('v20.0.0')).toBe(true);
    expect(nodeMajorOk('v18.20.0')).toBe(false);
    expect(nodeMajorOk('')).toBe(false);
    expect(nodeMajorOk('garbage')).toBe(false);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gitora-cache-'));
    try {
      const cache = path.join(dir, 'gitora-nodecache');
      const writable = path.join(cache, 'writable', 'npm-cache');
      await fs.mkdir(path.join(cache, 'node'), { recursive: true });
      await fs.writeFile(path.join(cache, 'node.zip'), 'zip', 'utf8');
      await fs.writeFile(path.join(cache, '.node-version'), '22.23.2', 'utf8');
      await fs.mkdir(writable, { recursive: true });
      await fs.writeFile(path.join(writable, 'keepme'), 'x', 'utf8');
      await removeNodeArtifacts(cache);
      expect(await fs.readdir(cache)).toEqual(['writable']);
      expect(await fs.readFile(path.join(writable, 'keepme'), 'utf8')).toBe('x');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
