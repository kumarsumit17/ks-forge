// Prints the release notes for a version: its CHANGELOG.md section, then how to install the
// files (neither is signed by Apple or Microsoft yet: specs/plan.md, 8).
//
//   node scripts/release-notes.mjs 0.1.0
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function section(changelog, version) {
  const lines = changelog.replace(/\r/g, "").split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start < 0) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

export function notes(changelog, version) {
  return `${section(changelog, version)}

### Install

- **macOS** (Apple silicon): open \`ks-forge-v${version}-macos-arm64.dmg\` and drag KS Forge into Applications. The app is not yet signed by Apple: the first time, open it, then allow it in System Settings › Privacy & Security › Open Anyway.
- **Windows** (x64, Windows 10 1809 or later): run \`ks-forge-v${version}-windows-x64-setup.exe\`. It installs for your user only, without admin rights. The installer is not yet signed: if SmartScreen asks, choose More info › Run anyway.

Every file has a build provenance attestation: \`gh attestation verify <file> -R kumarsumit17/ks-forge\`.
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  process.stdout.write(notes(readFileSync(join(root, "CHANGELOG.md"), "utf8"), process.argv[2]));
}
