# Installs the project-progress plugin and makes the settings it cannot make itself.
# Safe to re-run; it is also how an old zip install moves over.
#   irm https://raw.githubusercontent.com/WenyuChiou/claude-progress-pane/main/scripts/setup.ps1 | iex
#   powershell -ExecutionPolicy Bypass -File setup.ps1 [-KeepRule] [-NoInstall]
#
# 1. With `claude` on PATH (and no -NoInstall): adds the claude-progress-pane marketplace
#    and installs project-progress from it. Both steps are no-ops once done.
# 2. settings.json env: CLAUDE_CODE_ENABLE_TODO_TOOLS=1 unless already set. Newer models
#    leave the Task tools out without it, and the pane mirrors them.
# 3. settings.json env: drops the old zip install (...\mods\project-progress) from
#    CLAUDE_CODE_PLUGIN_DIRS, so the mod does not load twice.
# 4. CLAUDE.md: drops the <!-- project-progress:start/end --> block; the plugin now adds
#    the rule itself. With -KeepRule it writes or refreshes that block instead: use it
#    where an organization manages Claude Code, since the plugin's own rule does not run there.
# Each file it changes is copied to <file>.bak first. It deletes nothing on disk.
param([switch]$KeepRule, [switch]$NoInstall)

function Install-ProgressPane {
  param([bool]$KeepRule, [bool]$NoInstall, [string]$Here)
  $ErrorActionPreference = 'Stop'
  $marketplace = 'WenyuChiou/claude-progress-pane'
  $plugin = 'project-progress@claude-progress-pane'

  if ($env:CLAUDE_CONFIG_DIR) { $claude = $env:CLAUDE_CONFIG_DIR }
  else { $claude = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.claude' }
  $utf8 = New-Object System.Text.UTF8Encoding $false   # no BOM: Claude Code parses these files
  $done = @()

  # The plugin itself
  if (-not $NoInstall) {
    if (Get-Command claude -ErrorAction SilentlyContinue) {
      & claude plugin marketplace add $marketplace
      if ($LASTEXITCODE -ne 0) {
        Write-Warning ("Could not add $marketplace. For a private repository run 'gh auth login' and " +
          "'gh auth setup-git' once; without a GitHub SSH key also set CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1. Then run this again.")
        return
      }
      & claude plugin install $plugin
      if ($LASTEXITCODE -ne 0) { Write-Warning "Could not install $plugin."; return }
    }
    else {
      Write-Warning "claude is not on PATH: run 'claude plugin marketplace add $marketplace' and 'claude plugin install $plugin' yourself."
    }
  }

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
  $next = $md
  if ($KeepRule) {
    # Beside this script, or in the marketplace's clone when the script came through iex.
    $ruleFile = ''
    if ($Here) { $ruleFile = Join-Path $Here 'claude-md-rule.md' }
    if (-not $ruleFile -or -not (Test-Path $ruleFile)) {
      $ruleFile = $claude
      foreach ($part in 'plugins', 'marketplaces', 'claude-progress-pane', 'scripts', 'claude-md-rule.md') {
        $ruleFile = Join-Path $ruleFile $part
      }
    }
    if (-not (Test-Path $ruleFile)) { Write-Warning "Rule file not found: $ruleFile"; return }
    $block = [IO.File]::ReadAllText($ruleFile).Trim()
    if ([regex]::IsMatch($md, $pattern)) {
      $next = [regex]::Replace($md, $pattern, [Text.RegularExpressions.MatchEvaluator] { param($m) $block })
    }
    else { $next = ($md.TrimEnd() + "`n`n" + $block).TrimStart() }
    $next = $next.TrimEnd() + "`n"
    $what = 'wrote the project-progress rule block'
  }
  elseif ([regex]::IsMatch($md, $pattern)) {
    $next = [regex]::Replace($md, "(\r?\n)*$pattern(\r?\n)*", "`n`n")
    if ($next.Trim()) { $next = $next.TrimStart("`r", "`n").TrimEnd() + "`n" } else { $next = '' }
    $what = 'removed the project-progress rule block (the plugin adds it now)'
  }
  if ($next -ne $md) {
    if (Test-Path $mdPath) { Copy-Item $mdPath "$mdPath.bak" -Force }
    [IO.File]::WriteAllText($mdPath, $next, $utf8)
    $done += "CLAUDE.md: $what"
  }

  if ($done.Count -eq 0) { Write-Host 'Settings: nothing to change.' }
  else { $done | ForEach-Object { Write-Host "- $_" } }
  $oldDir = Join-Path (Join-Path $claude 'mods') 'project-progress'
  if (Test-Path $oldDir) { Write-Host "The old install is still at $oldDir; delete it once the plugin works." }
  Write-Host 'Restart Claude Code. The pane opens by itself; /progress reopens it.'
}

Install-ProgressPane -KeepRule:$KeepRule -NoInstall:$NoInstall -Here $PSScriptRoot
