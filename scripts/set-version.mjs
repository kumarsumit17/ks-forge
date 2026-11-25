// Writes the version from a release tag into the files that carry one. Run only in CI on a
// fresh checkout; the repository keeps the placeholder 0.0.0 (versions come from git tags,
// never hardcoded: KS-Suite specs/versioning-signing.md).
//
//   node scripts/set-version.mjs <tag> [root]      e.g. v1.2.3, mac-v1.3.0, windows-v1.4.0
//
// Accepts vMAJOR.MINOR.PATCH (both platforms) or mac-v… / windows-v… (one platform; KS-Suite
// specs/versioning-signing.md, "Platform tags"), no leading zeros, no suffix. Every file is checked before
// any is written: each must still hold exactly the placeholder (or, for the JSON files, no
// version key), otherwise nothing is written and the script exits 1.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TAG = /^(?:(mac|windows)-)?v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function versionOf(tag) {
  if (!TAG.test(tag ?? "")) throw new Error(`"${tag}" is not a release tag (expected vX.Y.Z, mac-vX.Y.Z or windows-vX.Y.Z)`);
  return tag.slice(tag.indexOf("v") + 1);
}

/** "all" for a plain tag, else "mac" or "windows". */
export function platformOf(tag) {
  const m = TAG.exec(tag ?? "");
  if (!m) throw new Error(`"${tag}" is not a release tag`);
  return m[1] ?? "all";
}

const cmp = (a, b) => {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

/**
 * Why a new tag's version is too low, or null: each platform's next version is higher than
 * its own latest tag and the latest plain tag; a plain tag is higher than every tag.
 */
export function tooLow(tag, existing) {
  const platform = platformOf(tag);
  const version = versionOf(tag);
  for (const t of existing) {
    if (t === tag || !TAG.test(t)) continue;
    const p = platformOf(t);
    const counts = platform === "all" || p === "all" || p === platform;
    if (counts && cmp(versionOf(t), version) >= 0) return `${tag} must be higher than ${t}`;
  }
  return null;
}

export const eolOf = (text) => (text.includes("\r\n") ? "\r\n" : "\n");

const once = (text, find, replace, file) => {
  const n = text.split(find).length - 1;
  if (n !== 1) throw new Error(`${file}: expected the placeholder exactly once, found ${n}`);
  return text.replace(find, replace);
};

const addJsonVersion = (text, version, after, file) => {
  if (/^\s*"version"\s*:/m.test(text)) throw new Error(`${file}: already has a version`);
  const re = new RegExp(`^([ \\t]*)"${after}"[ \\t]*:.*,$`, "m");
  const m = text.match(re);
  if (!m) throw new Error(`${file}: "${after}" line not found`);
  return text.replace(re, `${m[0]}${eolOf(text)}${m[1]}"version": "${version}",`);
};

export function edits(version) {
  return [
    ["shared/package.json", (t, f) => addJsonVersion(t, version, "private", f)],
    ["shared/src-tauri/tauri.conf.json", (t, f) => addJsonVersion(t, version, "productName", f)],
    ["shared/src-tauri/Cargo.toml", (t, f, n = eolOf(t)) => once(t, `${n}version = "0.0.0"${n}`, `${n}version = "${version}"${n}`, f)],
    ["shared/src-tauri/Cargo.lock", (t, f, n = eolOf(t)) => once(t, `name = "ks-forge"${n}version = "0.0.0"${n}`, `name = "ks-forge"${n}version = "${version}"${n}`, f)],
  ];
}

export function setVersion(tag, root) {
  const version = versionOf(tag);
  const out = edits(version).map(([rel, edit]) => {
    const file = join(root, rel);
    return [file, edit(readFileSync(file, "utf8"), rel)];
  });
  for (const [file, text] of out) writeFileSync(file, text);
  return version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [tag, root = join(dirname(fileURLToPath(import.meta.url)), "..")] = process.argv.slice(2);
  try {
    console.log(`version ${setVersion(tag, root)}`);
  } catch (e) {
    console.error(`set-version: ${e.message}`);
    process.exit(1);
  }
}
