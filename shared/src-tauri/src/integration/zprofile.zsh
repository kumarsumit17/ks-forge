# KS Forge shell integration (zsh): the user's own .zprofile.
_ksf_zdotdir=$ZDOTDIR
ZDOTDIR=$KSF_USER_ZDOTDIR
[[ -r "$ZDOTDIR/.zprofile" ]] && source "$ZDOTDIR/.zprofile"
KSF_USER_ZDOTDIR=$ZDOTDIR
ZDOTDIR=$_ksf_zdotdir
unset _ksf_zdotdir
