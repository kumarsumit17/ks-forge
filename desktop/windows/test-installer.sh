#!/bin/sh
# Installs the Windows installer silently (per user, no admin), checks the files, runs the
# app's self-test from the installed copy, then uninstalls and checks it is gone.
# Runs in Git Bash on the windows-2025 runner.
#
#   desktop/windows/test-installer.sh <setup.exe>
set -eu
SETUP=${1:?installer}
DIR="$LOCALAPPDATA/KS Forge"
EXE="$DIR/ks-forge.exe"

echo "installing $SETUP"
cmd //c "\"$(cygpath -w "$SETUP")\" /S"
for i in $(seq 1 60); do [ -f "$EXE" ] && break; sleep 1; done
[ -f "$EXE" ] || { echo "::error::not installed: $EXE"; ls -la "$DIR" 2>/dev/null || true; exit 1; }
[ -f "$DIR/uninstall.exe" ] || { echo "::error::no uninstaller"; exit 1; }
echo "installed: $EXE"

echo "self-test of the installed copy"
HERE=$(cd "$(dirname "$0")/../.." && pwd)
node "$HERE/scripts/selftest.mjs" "$EXE" || { echo "::error::self-test failed"; exit 1; }

echo "uninstalling"
cmd //c "\"$(cygpath -w "$DIR/uninstall.exe")\" /S"
for i in $(seq 1 60); do [ ! -f "$EXE" ] && break; sleep 1; done
[ ! -f "$EXE" ] || { echo "::error::still installed after uninstall"; exit 1; }
echo "uninstalled"
