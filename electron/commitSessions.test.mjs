import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildProvisionScript,
  buildSdkWrapper,
  buildWsb,
  detectLaunchFile,
  hasDotnet10,
  isAlive,
  newSession,
  normalizeSessionInput,
  sdkCacheDir,
  sessionDir,
  tailText,
  validateLaunchFile,
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
