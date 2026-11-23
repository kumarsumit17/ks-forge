# KS Forge shell integration (zsh), loaded through ZDOTDIR. Runs the user's own file first.
_ksf_zdotdir=$ZDOTDIR
ZDOTDIR=${KSF_USER_ZDOTDIR:-$HOME}
[[ -r "$ZDOTDIR/.zshenv" ]] && source "$ZDOTDIR/.zshenv"
KSF_USER_ZDOTDIR=$ZDOTDIR
ZDOTDIR=$_ksf_zdotdir
unset _ksf_zdotdir
