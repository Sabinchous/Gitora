$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$output = Join-Path $root 'outputs\release'
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$tempOutput = Join-Path $tempRoot ("gitora-electron-build-" + [guid]::NewGuid().ToString('N'))

Push-Location $root
try {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Vite build failed' }

  & npx electron-builder "--config.directories.output=$tempOutput"
  if ($LASTEXITCODE -ne 0) { throw 'Electron build failed' }

  New-Item -ItemType Directory -Force -Path $output | Out-Null
  Get-ChildItem -LiteralPath $tempOutput -File |
    Where-Object { $_.Extension -in '.exe', '.blockmap' -or $_.Name -eq 'latest.yml' } |
    Copy-Item -Destination $output -Force

  Write-Host "Installer artifacts: $output"
}
finally {
  Pop-Location
  $resolvedTemp = [System.IO.Path]::GetFullPath($tempOutput)
  if ($resolvedTemp.StartsWith($tempRoot) -and (Test-Path -LiteralPath $resolvedTemp)) {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
  }
}
