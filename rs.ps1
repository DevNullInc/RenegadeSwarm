<#
  RenegadeSwarm - Decentralized P2P AI Model Distribution Network
  Copyright (C) 2026 DevNullInc & The RenegadeSwarm Contributors
  Licensed under GNU General Public License v3.0 (GPL-3.0)
#>
<#
.SYNOPSIS
  RenegadeSwarm - Local launcher & lifecycle control script.

.DESCRIPTION
  Start, stop, restart, build, test, and manage the RenegadeSwarm desktop application from the terminal.

.PARAMETER Action
  The action to perform: start, stop, restart, status, build, package, dist, test, clean-assets, help (default: start)

.PARAMETER Port
  Vite dev-server port (default: 5181)

.PARAMETER ListenPort
  P2P BitTorrent wire protocol port (default: 6881)

.EXAMPLE
  .\rs.ps1 start
  .\rs.ps1 start -Port 5181
  .\rs.ps1 stop
  .\rs.ps1 restart
  .\rs.ps1 status
  .\rs.ps1 build
  .\rs.ps1 test
#>

param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'run', 'dev', 'stop', 'kill', 'restart', 'status', 'build', 'package', 'dist', 'test', 'clean-assets', 'bump-version', 'version', 'help')]
  [string]$Action = 'start',

  [int]$Port = 5181,
  [int]$ListenPort = 6881,

  [switch]$Headless,
  [switch]$NoWindow,
  [switch]$CleanAssets,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
$PidFile = Join-Path $ProjectRoot '.rs.pid'
$InstalledMarker = Join-Path $ProjectRoot '.installed'

if ($Port -lt 1024 -or $Port -gt 65535) {
  Write-Host "  [!!] Invalid Port ($Port). Must be between 1024 and 65535." -ForegroundColor Red
  exit 1
}

# -- Window Helper for Bringing Existing Window to Foreground -------------
function Add-WindowHelperType {
  if ('WindowHelper' -as [type]) { return }
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WindowHelper {
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsIconic(IntPtr hWnd);
}
"@ -ErrorAction SilentlyContinue
}

function Write-Status {
  param([string]$Icon, [string]$Msg, [string]$Color = 'Cyan')
  Write-Host "  [$Icon] " -NoNewline -ForegroundColor $Color
  Write-Host $Msg
}

function Set-ProcessWindowFocus {
  param([System.Diagnostics.Process]$Proc)
  Add-WindowHelperType
  if ($Proc -and $Proc.MainWindowHandle -and $Proc.MainWindowHandle -ne [IntPtr]::Zero) {
    try {
      if ([WindowHelper]::IsIconic($Proc.MainWindowHandle)) {
        [WindowHelper]::ShowWindowAsync($Proc.MainWindowHandle, 9) | Out-Null
      } else {
        [WindowHelper]::ShowWindowAsync($Proc.MainWindowHandle, 5) | Out-Null
      }
      [WindowHelper]::SetForegroundWindow($Proc.MainWindowHandle) | Out-Null
      return $true
    } catch { }
  }
  return $false
}

function Wait-TcpPortReady {
  param([int]$Port, [int]$MaxWaitMs = 8000)
  $deadline = [Environment]::TickCount64 + $MaxWaitMs
  while ([Environment]::TickCount64 -lt $deadline) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
      $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
      if ($async.AsyncWaitHandle.WaitOne(150)) {
        $client.EndConnect($async)
        return $true
      }
    } catch { }
    finally { try { $client.Close() } catch { } }
    Start-Sleep -Milliseconds 100
  }
  return $false
}

$ProtectedBrowsers = @(
  'firefox', 'firefox-bin', 'chrome', 'googlechrome', 'chromium',
  'brave', 'opera', 'msedge', 'safari', 'vivaldi', 'zen', 'librewolf',
  'waterfox', 'tor', 'explorer', 'powershell', 'pwsh', 'cmd', 'conhost',
  'windowsterminal', 'system', 'svchost', 'taskmgr', 'csrss', 'lsass'
)

function Test-IsSafeToKill([System.Diagnostics.Process]$Proc, [hashtable]$CmdLines = @{}) {
  if (-not $Proc -or $Proc.HasExited) { return $false }
  if ($Proc.Id -le 4 -or $Proc.Id -eq $PID) { return $false }

  $name = $Proc.ProcessName.ToLower()
  foreach ($prot in $ProtectedBrowsers) {
    if ($name -like "*$prot*") { return $false }
  }

  $cmd = if ($CmdLines.ContainsKey($Proc.Id)) { [string]$CmdLines[$Proc.Id] } else { '' }
  $cmdLower = $cmd.ToLower()

  # NEVER touch or match RenegadeCMM processes
  if ($cmdLower -like "*renegadecmm*") { return $false }

  try {
    $procPath = $Proc.MainModule.FileName.ToLower()
    if ($procPath -like "*renegadecmm*") { return $false }
    foreach ($prot in $ProtectedBrowsers) {
      if ($procPath -like "*$prot*") { return $false }
    }
  } catch { }

  if ($name -eq 'electron' -or $name -eq 'node' -or $name -like '*renegadeswarm*') {
    if ($cmdLower) {
      if ($cmdLower -like "*renegadeswarm*" -or $cmdLower -like "*$($ProjectRoot.ToLower())*") {
        return $true
      }
    }
    try {
      if ($Proc.MainModule.FileName -like "*$ProjectRoot*") {
        return $true
      }
    } catch { }
  }

  return $false
}

function Get-CommandLineCache([int[]]$Pids) {
  $cache = @{}
  if (-not $Pids -or $Pids.Count -eq 0) { return $cache }
  $uniq = @($Pids | Select-Object -Unique | Where-Object { $_ -gt 4 })
  if ($uniq.Count -eq 0) { return $cache }

  try {
    $filter = ($uniq | ForEach-Object { "ProcessId = $_" }) -join ' OR '
    $items = Get-CimInstance Win32_Process -Filter $filter -Property ProcessId, CommandLine -ErrorAction SilentlyContinue
    if ($items) {
      foreach ($it in $items) {
        if ($it.ProcessId -and $it.CommandLine) {
          $cache[[int]$it.ProcessId] = [string]$it.CommandLine
        }
      }
    }
  } catch { }
  return $cache
}

function Get-RunningProcs {
  $running = @()
  $seenPids = New-Object System.Collections.Generic.HashSet[int]
  $candidates = New-Object System.Collections.ArrayList

  # 1. Check .rs.pid file
  if (Test-Path $PidFile) {
    $rawPid = Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($rawPid -match '^\d+$') {
      $p = Get-Process -Id ([int]$rawPid) -ErrorAction SilentlyContinue
      if ($p -and $seenPids.Add($p.Id)) {
        $candidates.Add([pscustomobject]@{ Pid = $p.Id; Proc = $p }) | Out-Null
      }
    }
  }

  # 2. Check network ports 5180 ($Port)
  $portHolders = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
  if ($portHolders) {
    foreach ($ph in $portHolders) {
      if ($ph -gt 4 -and $seenPids.Add($ph)) {
        $proc = Get-Process -Id $ph -ErrorAction SilentlyContinue
        if ($proc) { $candidates.Add([pscustomobject]@{ Pid = $proc.Id; Proc = $proc }) | Out-Null }
      }
    }
  }

  # 3. Check Electron & Node processes strictly within this workspace (excluding RenegadeCMM)
  $allProcs = @(Get-Process -Name 'electron', 'node' -ErrorAction SilentlyContinue)
  foreach ($ep in $allProcs) {
    try {
      if ($ep.Path -like "*$ProjectRoot*" -and $ep.Path -notlike "*RenegadeCMM*") {
        if ($seenPids.Add($ep.Id)) { $candidates.Add([pscustomobject]@{ Pid = $ep.Id; Proc = $ep }) | Out-Null }
      }
    } catch { }
  }

  if ($candidates.Count -eq 0) { return $running }

  $cmdCache = Get-CommandLineCache @($candidates | ForEach-Object { $_.Pid })
  foreach ($cand in $candidates) {
    if (Test-IsSafeToKill $cand.Proc $cmdCache) {
      $running += $cand.Proc
    }
  }

  return $running
}

function Stop-App {
  $procs = Get-RunningProcs
  if ($procs.Count -eq 0) {
    Write-Status '!' 'No running RenegadeSwarm processes found.' 'Yellow'
    return $false
  }

  Write-Status 'x' "Stopping $($procs.Count) process(es)..." 'Red'
  $cmdCache = Get-CommandLineCache @($procs | ForEach-Object { $_.Id })
  foreach ($p in $procs) {
    try {
      if (Test-IsSafeToKill $p $cmdCache) {
        Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        Write-Status 'ok' "Terminated PID $($p.Id) ($($p.ProcessName))" 'DarkGray'
      }
    }
    catch {
      Write-Status '!!' "Failed to terminate PID $($p.Id): $_" 'Red'
    }
  }

  if (Test-Path $PidFile) {
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  }
  Write-Status 'ok' 'RenegadeSwarm stopped.' 'Green'
  return $true
}

function Clean-Assets {
  $assetsDir = Join-Path $ProjectRoot 'dist\renderer\assets'
  $indexHtml = Join-Path $ProjectRoot 'dist\renderer\index.html'

  if (-not (Test-Path $assetsDir)) {
    Write-Status '!' 'No dist\renderer\assets directory found; nothing to clean.' 'DarkGray'
    return
  }

  $keep = New-Object System.Collections.Generic.HashSet[string]
  if (Test-Path $indexHtml) {
    $html = Get-Content -LiteralPath $indexHtml -Raw -ErrorAction SilentlyContinue
    if ($html) {
      [regex]::Matches($html, '(?:src|href)\s*=\s*["'']([^"'']*assets/[^"'']+)["'']') |
        ForEach-Object {
          $ref = $_.Groups[1].Value
          if ($ref -match '\.(js|css)$') {
            $name = [System.IO.Path]::GetFileName($ref.TrimEnd('/'))
            if ($name) { [void]$keep.Add($name) }
          }
        }
    }
  }

  $candidates = @(Get-ChildItem -LiteralPath $assetsDir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^index-.*\.(js|css)$' })
  foreach ($group in $candidates | Group-Object { $_.Extension.ToLowerInvariant() }) {
    $newest = $group.Group | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($newest) { [void]$keep.Add($newest.Name) }
  }

  $removed = 0
  foreach ($file in $candidates) {
    if ($keep.Contains($file.Name)) { continue }
    try {
      Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
      $removed++
    }
    catch {
      Write-Status '!' "Skipped $($file.Name): $($_.Exception.Message)" 'DarkGray'
    }
  }

  if ($removed -gt 0) {
    Write-Status 'ok' "Pruned $removed orphaned asset(s) from dist\renderer\assets." 'Green'
  }
  else {
    Write-Status 'ok' 'No orphaned renderer assets to prune.' 'DarkGray'
  }
}

function Ensure-NodeInstalled {
  $nodeModulesDir = Join-Path $ProjectRoot 'node_modules'
  if (Test-Path $InstalledMarker) {
    if (Test-Path $nodeModulesDir) { return }
    Remove-Item $InstalledMarker -Force -ErrorAction SilentlyContinue
  }

  $nvmCmd = Get-Command 'nvm' -ErrorAction SilentlyContinue
  $nodeCmd = Get-Command 'node' -ErrorAction SilentlyContinue
  $npmCmd = Get-Command 'npm' -ErrorAction SilentlyContinue

  # 1. Check for NVM existence first; if present, ensure Node 24 is active
  if ($nvmCmd) {
    $nodeVerRaw = if ($nodeCmd) { (& node -v) } else { '' }
    $needsSwitch = $true
    if ($nodeVerRaw -match '^v?(\d+)') {
      if ([int]$Matches[1] -ge 24) {
        $needsSwitch = $false
      }
    }
    if ($needsSwitch) {
      Write-Status '>>' "NVM detected. Attempting to activate Node.js 24 ('nvm use 24')..." 'Cyan'
      try {
        & nvm use 24 | Out-Null
        $nodeCmd = Get-Command 'node' -ErrorAction SilentlyContinue
        $npmCmd = Get-Command 'npm' -ErrorAction SilentlyContinue
      } catch { }
    }
  }

  # 2. Verify Node.js and NPM existence
  if (-not $nodeCmd -or -not $npmCmd) {
    Write-Status '!' 'Node.js runtime was not detected on this system.' 'Yellow'
    Write-Host '  RenegadeSwarm requires Node.js (v24+ LTS recommended, v20 minimum).' -ForegroundColor Yellow
    Write-Host '  To install Node version management on Windows, visit: https://nvm-windows.com/' -ForegroundColor Cyan
    exit 1
  }

  # 3. Version inspection, fallback to Node 20, and guidance
  try {
    $nodeVerRaw = & node -v
    if ($nodeVerRaw -match '^v?(\d+)') {
      $major = [int]$Matches[1]
      if ($major -lt 20) {
        Write-Status '!' "Active Node.js version is $nodeVerRaw. RenegadeSwarm requires at least Node.js v20.0.0 (v24+ recommended)." 'Red'
        if (-not $nvmCmd) {
          Write-Host '  Install NVM for Windows from https://nvm-windows.com/ to upgrade easily.' -ForegroundColor Yellow
        }
        exit 1
      } elseif ($major -lt 24) {
        if ($nvmCmd) {
          Write-Status '!' "Node.js 24 is not installed in NVM (currently running $nodeVerRaw). Falling back to Node $major." 'Yellow'
          Write-Host '  Run `nvm install 24 && nvm use 24` to upgrade to Node 24.' -ForegroundColor DarkCyan
        } else {
          Write-Status '!' "Node.js $nodeVerRaw is active. (Node.js v24+ LTS recommended to avoid build deprecation notices)." 'Yellow'
          Write-Host '  NVM was not detected. To install NVM for Windows, visit: https://nvm-windows.com/' -ForegroundColor Cyan
          Write-Host '  Continuing with active Node.js runtime...' -ForegroundColor DarkGray
        }
      }
    }
  } catch { }

  if (-not (Test-Path $nodeModulesDir)) {
    Write-Status '>>' 'Installing dependencies (npm install)...' 'Cyan'
    Push-Location $ProjectRoot
    try {
      & npm install
    } finally {
      Pop-Location
    }
  }

  Set-Content -Path $InstalledMarker -Value ([DateTime]::UtcNow.ToString('o')) -Force
}

function Show-Status {
  Write-Host ''
  Write-Host '  =======================================================' -ForegroundColor Cyan
  Write-Host '    RenegadeSwarm - Decentralized P2P AI Model Distribution' -ForegroundColor White
  Write-Host '  =======================================================' -ForegroundColor Cyan
  Write-Host ''

  $procs = Get-RunningProcs
  if ($procs.Count -gt 0) {
    Write-Status '●' "RenegadeSwarm is RUNNING ($($procs.Count) active process(es))" 'Green'
    foreach ($p in $procs) {
      $memMb = [Math]::Round($p.WorkingSet64 / 1MB, 1)
      Write-Host "      PID $($p.Id) - $($p.ProcessName) (${memMb} MB memory)" -ForegroundColor DarkGray
    }
  } else {
    Write-Status '○' 'RenegadeSwarm is STOPPED' 'DarkGray'
  }

  # Check ports
  $viteActive = Test-TcpPortActive $Port
  if ($viteActive) {
    Write-Status 'ok' "Renderer Dev Port $Port is ACTIVE (http://localhost:$Port)" 'Green'
  }

  # Check CMM status
  $cmmPaths = @(
    'D:\gitprojects\RenegadeCMM\renegadecmm.sqlite',
    '..\RenegadeCMM\renegadecmm.sqlite',
    "$env:APPDATA\RenegadeCMM\renegadecmm.sqlite"
  )
  $cmmFound = $false
  foreach ($cp in $cmmPaths) {
    if (Test-Path $cp) {
      Write-Status 'ok' "RenegadeCMM Database detected at: $cp" 'Green'
      $cmmFound = $true
      break
    }
  }
  if (-not $cmmFound) {
    Write-Status '!' 'RenegadeCMM Database: Not detected in default locations' 'DarkGray'
  }
  Write-Host ''
}

function Test-TcpPortActive([int]$Port) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return ($null -ne $conns -and $conns.Count -gt 0)
}

function Start-App {
  $procs = Get-RunningProcs
  if ($procs.Count -gt 0) {
    Write-Status '!' 'RenegadeSwarm is already running.' 'Yellow'
    foreach ($p in $procs) {
      if (Set-ProcessWindowFocus $p) {
        Write-Status 'ok' "Brought window to foreground (PID $($p.Id))." 'Green'
        return
      }
    }
    return
  }

  Ensure-NodeInstalled

  if ($CleanAssets) {
    Clean-Assets
  }

  Write-Status '>>' "Starting RenegadeSwarm Desktop..." 'Cyan'

  Push-Location $ProjectRoot
  try {
    # Build if dist does not exist
    if (-not (Test-Path 'dist\main\index.js') -or -not (Test-Path 'dist\renderer\index.html')) {
      Write-Status '>>' 'Compiling main and renderer bundles...' 'Cyan'
      & npm run build
    }

    $electronExe = Join-Path $ProjectRoot 'node_modules\electron\dist\electron.exe'
    $proc = $null

    if (Test-Path $electronExe) {
      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = $electronExe
      $psi.Arguments = "."
      $psi.WorkingDirectory = $ProjectRoot
      $psi.UseShellExecute = $true
      $proc = [System.Diagnostics.Process]::Start($psi)
    } else {
      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = 'npx'
      $psi.Arguments = "electron ."
      $psi.WorkingDirectory = $ProjectRoot
      $psi.UseShellExecute = $true
      $proc = [System.Diagnostics.Process]::Start($psi)
    }

    if ($proc) {
      Set-Content -Path $PidFile -Value $proc.Id -Force
      Write-Status 'ok' "RenegadeSwarm launched with PID $($proc.Id)" 'Green'
      Write-Status 'tip' "Use '.\rs.ps1 status' or '.\rs.ps1 stop' to manage." 'DarkCyan'
    }
  } finally {
    Pop-Location
  }
}

function Run-Build {
  Ensure-NodeInstalled
  Write-Status '>>' 'Building RenegadeSwarm production bundles...' 'Cyan'
  Push-Location $ProjectRoot
  try {
    & npm run build
    Write-Status 'ok' 'Build completed successfully.' 'Green'
  } finally {
    Pop-Location
  }
}

function Run-Dist {
  Ensure-NodeInstalled
  Write-Status '>>' 'Packaging standalone application with electron-builder...' 'Cyan'
  Push-Location $ProjectRoot
  try {
    & npm run dist:win
    Write-Status 'ok' 'Packaging completed.' 'Green'
  } finally {
    Pop-Location
  }
}

function Run-Test {
  Ensure-NodeInstalled
  Write-Status '>>' 'Running Vitest test suite...' 'Cyan'
  Push-Location $ProjectRoot
  try {
    & npm test
  } finally {
    Pop-Location
  }
}

function Run-BumpVersion {
  Ensure-NodeInstalled
  $scriptPath = Join-Path $ProjectRoot 'scripts\bump-version.js'
  if (-not (Test-Path $scriptPath)) {
    Write-Host "  [!] Version bump utility '$scriptPath' not found." -ForegroundColor Yellow
    return
  }
  Push-Location $ProjectRoot
  try {
    if ($RemainingArgs -and $RemainingArgs.Count -gt 0) {
      & node $scriptPath @RemainingArgs
    } else {
      & node $scriptPath --help
    }
  } finally {
    Pop-Location
  }
}

function Show-Help {
  Write-Host ''
  Write-Host '  =======================================================' -ForegroundColor Cyan
  Write-Host '    RenegadeSwarm CLI Control Script (rs.ps1)' -ForegroundColor White
  Write-Host '  =======================================================' -ForegroundColor Cyan
  Write-Host ''
  Write-Host '  USAGE:' -ForegroundColor Yellow
  Write-Host '    .\rs.ps1 <command> [options]' -ForegroundColor White
  Write-Host ''
  Write-Host '  COMMANDS:' -ForegroundColor Yellow
  Write-Host '    start, dev, run    Start the application locally (focuses if already running)' -ForegroundColor White
  Write-Host '    stop, kill         Stop and clean up all running RenegadeSwarm processes' -ForegroundColor White
  Write-Host '    restart            Restart the application' -ForegroundColor White
  Write-Host '    status             Display current application state, ports, PID, and CMM bridge' -ForegroundColor White
  Write-Host '    build              Compile TypeScript main & Vite renderer bundles' -ForegroundColor White
  Write-Host '    package, dist      Build standalone installer / executable via electron-builder' -ForegroundColor White
  Write-Host '    test               Run the 22 Vitest test suites (106 tests)' -ForegroundColor White
  Write-Host '    bump-version       Synchronize semantic versions across files (--patch, --minor, --major, or <ver>)' -ForegroundColor White
  Write-Host '    clean-assets       Prune stale/orphaned build chunks' -ForegroundColor White
  Write-Host '    help               Display this help text' -ForegroundColor White
  Write-Host ''
  Write-Host '  OPTIONS:' -ForegroundColor Yellow
  Write-Host '    -Port <int>        Set custom renderer port (default: 5181)' -ForegroundColor White
  Write-Host '    -CleanAssets       Prune stale bundles before starting' -ForegroundColor White
  Write-Host ''
}

# --- Action Dispatcher ---------------------------------------------------
switch ($Action.ToLower()) {
  { $_ -in 'start', 'run', 'dev' } {
    Start-App
  }
  { $_ -in 'stop', 'kill' } {
    Stop-App
  }
  'restart' {
    Stop-App
    Start-Sleep -Milliseconds 800
    Start-App
  }
  'status' {
    Show-Status
  }
  'build' {
    Run-Build
  }
  { $_ -in 'package', 'dist' } {
    Run-Dist
  }
  'test' {
    Run-Test
  }
  { $_ -in 'bump-version', 'version' } {
    Run-BumpVersion
  }
  'clean-assets' {
    Clean-Assets
  }
  'help' {
    Show-Help
  }
  default {
    Show-Help
  }
}
