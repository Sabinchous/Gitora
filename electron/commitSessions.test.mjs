import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildProvisionScript,
  buildWsb,
  detectLaunchFile,
  isAlive,
  newSession,
  sessionDir,
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
    expect(run).toContain('App.csproj'.replace('/', '\\'));
    expect(run).toContain('dotnet-install.ps1');
    expect(run).toContain('Expand-Archive');
    const buildOnly = buildProvisionScript({ launchFile: 'App.slnx' });
    expect(buildOnly).toContain('dotnet build');
    expect(buildOnly).not.toContain('dotnet run');
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
