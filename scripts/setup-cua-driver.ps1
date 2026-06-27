# Sharker — Cua Driver setup (Windows)
# @see docs/computer-use-setup.md · https://github.com/trycua/cua
param(
  [switch]$InstallMcp
)

$ErrorActionPreference = 'Stop'
$McpConfig = if ($env:SHARKER_MCP_CONFIG) { $env:SHARKER_MCP_CONFIG } else { Join-Path $env:USERPROFILE '.sharker\mcp.json' }

function Find-CuaDriver {
  $candidates = @(
    $env:SHARKER_CUA_DRIVER_BIN,
    $env:CUA_DRIVER_BIN,
    (Join-Path $env:LOCALAPPDATA 'Programs\Cua\cua-driver\bin\cua-driver.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\trycua\cua-driver-rs\bin\cua-driver.exe'),
    (Join-Path $env:USERPROFILE '.cua-driver\packages\current\cua-driver.exe')
  ) | Where-Object { $_ }

  foreach ($p in $candidates) {
    if (Test-Path -LiteralPath $p) { return $p }
  }
  $where = (Get-Command cua-driver -ErrorAction SilentlyContinue)?.Source
  if ($where) { return $where }
  return $null
}

Write-Host 'Sharker Cua Driver setup (Windows)'
Write-Host ''

$binary = Find-CuaDriver
if (-not $binary) {
  Write-Host 'cua-driver not found. Install with:' -ForegroundColor Yellow
  Write-Host '  irm https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.ps1 | iex'
  exit 1
}

Write-Host "Binary: $binary"
try {
  & $binary --version
} catch {
  Write-Host 'Version: unknown'
}
Write-Host ''
Write-Host 'Doctor:'
& $binary doctor
Write-Host ''

if ($InstallMcp) {
  $dir = Split-Path -Parent $McpConfig
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

  $servers = @()
  if (Test-Path $McpConfig) {
    $raw = Get-Content -Raw -LiteralPath $McpConfig | ConvertFrom-Json
    if ($raw.servers) { $servers = @($raw.servers) }
  }

  $entry = @{ name = 'cua-driver'; command = $binary; args = @('mcp') }
  $idx = -1
  for ($i = 0; $i -lt $servers.Count; $i++) {
    if ($servers[$i].name -eq 'cua-driver') { $idx = $i; break }
  }
  if ($idx -ge 0) { $servers[$idx] = $entry } else { $servers += $entry }

  @{ servers = $servers } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $McpConfig -Encoding UTF8
  Write-Host "MCP config written: $McpConfig"
  Write-Host 'Restart Sharker chat to refresh MCP tool pool.'
} else {
  Write-Host 'To write ~/.sharker/mcp.json run:'
  Write-Host "  powershell -File `"$PSCommandPath`" -InstallMcp"
}
