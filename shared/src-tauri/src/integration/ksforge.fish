# KS Forge shell integration (fish), loaded with --init-command after the user's config.
if not set -q KSF_INTEGRATED; and status is-interactive
  set -g KSF_INTEGRATED 1
  function __ksf_prompt --on-event fish_prompt
    printf '\e]7;file://%s%s\a' (hostname) "$PWD"
    printf '\e]133;A\a'
  end
  function __ksf_preexec --on-event fish_preexec
    printf '\e]133;C\a'
  end
  function __ksf_postexec --on-event fish_postexec
    printf '\e]133;D;%s\a' $status
  end
end
