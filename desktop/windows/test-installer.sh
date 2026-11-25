#!/bin/sh
# Installs the Windows installer silently (per user, no admin), checks the files, runs the
# app's self-test from the installed copy, then uninstalls and checks it is gone.
# Runs in Git Bash on the windows-2025 runner. MSYS2_ARG_CONV_EXCL stops Git Bash turning
# the NSIS switch /S into a path.
#
#   desktop/windows/test-installer.sh <setup.exe>
set -eu
SETUP=${1:?installer}
DIR="$LOCALAPPDATA/KS Forge"
EXE="$DIR/ks-forge.exe"

echo "installing $SETUP"
MSYS2_ARG_CONV_EXCL="*" "$SETUP" /S
for i in $(seq 1 60); do [ -f "$EXE" ] && break; sleep 1; done
[ -f "$EXE" ] || { echo "::error::not installed: $EXE"; ls -la "$DIR" 2>/dev/null || true; exit 1; }
[ -f "$DIR/uninstall.exe" ] || { echo "::error::no uninstaller"; exit 1; }
echo "installed: $EXE"
# File Explorer's "Open in KS Forge" (desktop/windows/hooks.nsh).
MSYS2_ARG_CONV_EXCL="*" reg query 'HKCU\Software\Classes\Directory\shell\KSForge\command' /ve | grep -q -- '-d' || { echo "::error::Open in KS Forge is not registered"; exit 1; }
echo "explorer menu: registered"

echo "self-test of the installed copy"
HERE=$(cd "$(dirname "$0")/../.." && pwd)
node "$HERE/scripts/selftest.mjs" "$EXE" || { echo "::error::self-test failed"; exit 1; }

echo "uninstalling"
MSYS2_ARG_CONV_EXCL="*" "$DIR/uninstall.exe" /S
for i in $(seq 1 60); do [ ! -f "$EXE" ] && break; sleep 1; done
[ ! -f "$EXE" ] || { echo "::error::still installed after uninstall"; exit 1; }
if MSYS2_ARG_CONV_EXCL="*" reg query 'HKCU\Software\Classes\Directory\shell\KSForge' > /dev/null 2>&1; then echo "::error::Open in KS Forge left behind"; exit 1; fi
echo "uninstalled"
