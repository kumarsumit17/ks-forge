# KS Forge shell integration (zsh): the user's own .zshrc, then the marks KS Forge reads.
# From here on ZDOTDIR is the user's again, so zsh reads their .zlogin and child shells
# behave as outside KS Forge.
ZDOTDIR=$KSF_USER_ZDOTDIR
unset KSF_USER_ZDOTDIR
[[ "$ZDOTDIR" == "$HOME" ]] && unset ZDOTDIR
[[ -r "${ZDOTDIR:-$HOME}/.zshrc" ]] && source "${ZDOTDIR:-$HOME}/.zshrc"

if [[ -z "$KSF_INTEGRATED" && -o interactive ]]; then
  typeset -g KSF_INTEGRATED=1 _ksf_ran=0
  # OSC 133 marks the prompt (A), the command's start (C) and its exit status (D);
  # OSC 7 reports the folder.
  _ksf_precmd() {
    local ret=$?
    (( _ksf_ran )) && printf '\e]133;D;%s\a' "$ret"
    _ksf_ran=0
    printf '\e]7;file://%s%s\a' "${HOST}" "${PWD}"
    printf '\e]133;A\a'
  }
  _ksf_preexec() {
    printf '\e]133;C\a'
    _ksf_ran=1
  }
  autoload -Uz add-zsh-hook
  add-zsh-hook precmd _ksf_precmd
  add-zsh-hook preexec _ksf_preexec
fi
