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
}
