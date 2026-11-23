# KS Forge shell integration (bash), loaded with --rcfile. Runs the user's own files first:
# the login files when bash was asked to be a login shell, else ~/.bashrc.
if [[ -n "$KSF_BASH_LOGIN" ]]; then
  unset KSF_BASH_LOGIN
  [[ -r /etc/profile ]] && . /etc/profile
  for _ksf_f in ~/.bash_profile ~/.bash_login ~/.profile; do
    if [[ -r "$_ksf_f" ]]; then . "$_ksf_f"; break; fi
  done
  unset _ksf_f
else
  [[ -r ~/.bashrc ]] && . ~/.bashrc
fi

if [[ -z "$KSF_INTEGRATED" && $- == *i* ]]; then
  KSF_INTEGRATED=1
  _ksf_ran=0
  _ksf_at_prompt=0
  _ksf_status=0
  _ksf_begin() { _ksf_status=$?; _ksf_at_prompt=0; }
  _ksf_prompt() {
    [[ $_ksf_ran == 1 ]] && printf '\e]133;D;%s\a' "$_ksf_status"
    _ksf_ran=0
    printf '\e]7;file://%s%s\a' "$HOSTNAME" "$PWD"
    printf '\e]133;A\a'
    _ksf_at_prompt=1
    return "$_ksf_status"
  }
  # A DEBUG trap someone else set is left alone: then commands get no start mark.
  if [[ -z "$(trap -p DEBUG)" ]]; then
    _ksf_preexec() {
      [[ $_ksf_at_prompt == 1 && $BASH_COMMAND != _ksf_begin* ]] || return 0
      _ksf_at_prompt=0
      _ksf_ran=1
      printf '\e]133;C\a'
    }
    trap '_ksf_preexec' DEBUG
  fi
  PROMPT_COMMAND="_ksf_begin;${PROMPT_COMMAND:+$PROMPT_COMMAND;}_ksf_prompt"
fi
