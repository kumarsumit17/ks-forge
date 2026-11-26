// Prints the release notes for a version: its CHANGELOG.md section, then how to install the
// files (neither is signed by Apple or Microsoft yet: specs/plan.md, 8).
//
//   node scripts/release-notes.mjs <tag>        e.g. v0.2.0, mac-v0.3.0
//
// A plain tag's section is "## [0.2.0] - date"; a platform tag's is "## [macOS 0.3.0] - date"
// or "## [Windows 0.4.0] - date".
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function heading(tag) {
  const m = /^(?:(mac|windows)-)?v(\d+\.\d+\.\d+)$/.exec(tag);
  if (!m) throw new Error(`"${tag}" is not a release tag`);
  return m[1] ? `${m[1] === "mac" ? "macOS" : "Windows"} ${m[2]}` : m[2];
}

export function section(changelog, version) {
  const lines = changelog.replace(/\r/g, "").split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start < 0) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

export function notes(changelog, tag) {
  const label = heading(tag);
  const version = label.split(" ").pop();
  const mac = !tag.startsWith("windows-");
  const win = !tag.startsWith("mac-");
  const lines = [];
  if (mac) lines.push(`- **macOS** (Apple silicon): open \`ks-forge-v${version}-macos-arm64.dmg\` and drag KS Forge into Applications. The app is not yet signed by Apple: the first time, open it, then allow it in System Settings › Privacy & Security › Open Anyway.`);
  if (win) lines.push(`- **Windows** (x64, Windows 10 1809 or later): run \`ks-forge-v${version}-windows-x64-setup.exe\`. It installs for your user only, without admin rights. The installer is not yet signed: if SmartScreen asks, choose More info › Run anyway.`);
  return `${section(changelog, label)}

### Install

${lines.join("\n")}

Every file has a build provenance attestation: \`gh attestation verify <file> -R kumasumit/ks-forge --signer-workflow kumasumit/ks-utility/.github/workflows/tauri-app-release-publish.yml\`.
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  process.stdout.write(notes(readFileSync(join(root, "CHANGELOG.md"), "utf8"), process.argv[2]));
}
