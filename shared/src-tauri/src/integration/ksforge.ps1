# KS Forge shell integration (PowerShell), passed with -EncodedCommand after the user's profile.
if (-not $global:__ksfIntegrated) {
  $global:__ksfIntegrated = $true
  $global:__ksfOriginalPrompt = $function:prompt
  $global:__ksfFirst = $true
  function global:prompt {
    $ok = $?
    $code = $global:LASTEXITCODE
    $e = [char]27
    $b = [char]7
    $out = ''
    if (-not $global:__ksfFirst) {
      $c = if ($ok) { 0 } elseif ($code) { $code } else { 1 }
      $out += "$e]133;D;$c$b"
    }
    $global:__ksfFirst = $false
    $loc = $executionContext.SessionState.Path.CurrentLocation
    if ($loc.Provider.Name -eq 'FileSystem') {
      $p = $loc.ProviderPath -replace '\\', '/'
      $out += "$e]7;file://$env:COMPUTERNAME/$p$b"
    }
    $out += "$e]133;A$b"
    $rest = & $global:__ksfOriginalPrompt
    $global:LASTEXITCODE = $code
    $out + $rest
  }
  # A command-start mark (OSC 133;C) when Enter runs a line, so the app can time commands.
  # Only when Enter is still PSReadLine's own AcceptLine, so a user's binding is kept.
  if (Get-Module -Name PSReadLine) {
    $h = Get-PSReadLineKeyHandler -Chord Enter -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($h -and $h.Function -eq 'AcceptLine') {
      Set-PSReadLineKeyHandler -Chord Enter -ScriptBlock {
        [Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine()
        [Console]::Write("$([char]27)]133;C$([char]7)")
      }
    }
  }
}
