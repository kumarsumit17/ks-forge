#!/bin/sh
# Makes the macOS disk image from the built (and signed) app, with an Applications link.
# System tools only.
#
#   desktop/mac/make-dmg.sh "<path>/KS Forge.app" <output.dmg>
set -eu
APP=${1:?app bundle}
DMG=${2:?output dmg}
NAME=$(basename "$APP" .app)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
ditto "$APP" "$STAGE/$NAME.app"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
hdiutil create -quiet -volname "$NAME" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG"
hdiutil verify -quiet "$DMG"
echo "dmg: $DMG"
