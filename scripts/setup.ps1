# Settings the plugin cannot make itself, and the move off the old zip install.
# Run once after `claude plugin install project-progress@claude-progress-pane`; safe to re-run.
#   powershell -ExecutionPolicy Bypass -File setup.ps1 [-KeepRule]
#
# 1. settings.json env: CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unless already set. Newer models
#    leave the Task tools out without it, and the pane mirrors them.
# 2. settings.json env: drops the old zip install (...\mods\project-progress) from
#    CLAUDE_CODE_PLUGIN_DIRS, so the mod does not load twice.
# 3. CLAUDE.md: drops the <!-- project-progress:start/end --> block; the plugin now adds
#    the rule itself. With -KeepRule it writes or refreshes that block instead: use it
#    where an organization manages Claude Code, since the plugin's own rule does not run there.
# Each file it changes is copied to <file>.bak first. It deletes nothing on disk.
param([switch]$KeepRule)
$ErrorActionPreference = 'Stop'

if ($env:CLAUDE_CONFIG_DIR) { $claude = $env:CLAUDE_CONFIG_DIR }
else { $claude = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.claude' }
$utf8 = New-Object System.Text.UTF8Encoding $false   # no BOM: Claude Code parses these files
$done = @()

# settings.json
$settingsPath = Join-Path $claude 'settings.json'
$settings = New-Object PSObject
if (Test-Path $settingsPath) {
  $text = [IO.File]::ReadAllText($settingsPath)
  if ($text.Trim()) { $settings = $text | ConvertFrom-Json }
}
$changed = $false
if (-not $settings.PSObject.Properties['env']) {
  $settings | Add-Member -NotePropertyName env -NotePropertyValue (New-Object PSObject)
}
if (-not $settings.env.PSObject.Properties['CLAUDE_CODE_ENABLE_TODO_TOOLS']) {
  $settings.env | Add-Member -NotePropertyName CLAUDE_CODE_ENABLE_TODO_TOOLS -NotePropertyValue '1'
  $changed = $true
  $done += 'set CLAUDE_CODE_ENABLE_TODO_TOOLS=1'
}
$oldMod = '[\\/]mods[\\/]project-progress[\\/]?$'
if ($settings.env.PSObject.Properties['CLAUDE_CODE_PLUGIN_DIRS']) {
  $sep = [IO.Path]::PathSeparator
  $dirs = @($settings.env.CLAUDE_CODE_PLUGIN_DIRS -split $sep | Where-Object { $_ })
  $keep = @($dirs | Where-Object { $_ -notmatch $oldMod })
  if ($keep.Count -ne $dirs.Count) {
    if ($keep.Count -eq 0) { $settings.env.PSObject.Properties.Remove('CLAUDE_CODE_PLUGIN_DIRS') }
    else { $settings.env.CLAUDE_CODE_PLUGIN_DIRS = $keep -join $sep }
    $changed = $true
    $dirs | Where-Object { $_ -match $oldMod } | ForEach-Object { $done += "removed $_ from CLAUDE_CODE_PLUGIN_DIRS" }
  }
}
if ($changed) {
  if (Test-Path $settingsPath) { Copy-Item $settingsPath "$settingsPath.bak" -Force }
  else { New-Item -ItemType Directory -Force -Path $claude | Out-Null }
  [IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json -Depth 64), $utf8)
}

# CLAUDE.md
$mdPath = Join-Path $claude 'CLAUDE.md'
$md = ''
if (Test-Path $mdPath) { $md = [IO.File]::ReadAllText($mdPath) }
$pattern = '(?s)<!-- project-progress:start -->.*?<!-- project-progress:end -->'
if ($KeepRule) {
  $block = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'claude-md-rule.md')).Trim()
  if ([regex]::IsMatch($md, $pattern)) {
    $next = [regex]::Replace($md, $pattern, [Text.RegularExpressions.MatchEvaluator] { param($m) $block })
  }
  else { $next = ($md.TrimEnd() + "`n`n" + $block).TrimStart() }
  $next = $next.TrimEnd() + "`n"
  $what = 'wrote the project-progress rule block'
}
else {
  $next = [regex]::Replace($md, "(\r?\n)*$pattern(\r?\n)*", "`n`n")
  if ($next.Trim()) { $next = $next.TrimStart("`r", "`n").TrimEnd() + "`n" } else { $next = '' }
  $what = 'removed the project-progress rule block (the plugin adds it now)'
}
if ($next -ne $md -and ($KeepRule -or [regex]::IsMatch($md, $pattern))) {
  if (Test-Path $mdPath) { Copy-Item $mdPath "$mdPath.bak" -Force }
  [IO.File]::WriteAllText($mdPath, $next, $utf8)
  $done += "CLAUDE.md: $what"
}

if ($done.Count -eq 0) { Write-Host 'Nothing to change.' }
else { $done | ForEach-Object { Write-Host "- $_" } }
$oldDir = Join-Path (Join-Path $claude 'mods') 'project-progress'
if (Test-Path $oldDir) { Write-Host "The old install is still at $oldDir; delete it once the plugin works." }
Write-Host 'Restart Claude Code. The pane opens by itself; /progress reopens it.'
