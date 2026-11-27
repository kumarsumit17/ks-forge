// KS-Suite rule "App icons": no build shows a default framework icon. Every icon Tauri bundles
// is drawn from our own source (scripts/make-icon.py) and comes in the sizes each system uses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const icons = join(root, "shared", "src-tauri", "icons");

const pngSize = (file) => {
  const b = readFileSync(file);
  assert.equal(b.subarray(1, 4).toString(), "PNG", file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

test("the bundle lists only our icons, in every size", () => {
  const conf = JSON.parse(readFileSync(join(root, "shared", "src-tauri", "tauri.conf.json"), "utf8"));
  assert.deepEqual(conf.bundle.icon, ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]);
  assert.deepEqual(pngSize(join(icons, "32x32.png")), [32, 32]);
  assert.deepEqual(pngSize(join(icons, "128x128.png")), [128, 128]);
  assert.deepEqual(pngSize(join(icons, "128x128@2x.png")), [256, 256]);
});

test("the Windows icon has 16 to 256 px and the installer uses it", () => {
  const ico = readFileSync(join(icons, "icon.ico"));
  const n = ico.readUInt16LE(4);
  const sizes = Array.from({ length: n }, (_, i) => ico[6 + 16 * i] || 256);
  for (const s of [16, 24, 32, 48, 64, 256]) assert.ok(sizes.includes(s), `icon.ico lacks ${s} px`);
  const win = JSON.parse(readFileSync(join(root, "desktop", "windows", "tauri.conf.json"), "utf8"));
  assert.equal(win.bundle.windows.nsis.installerIcon, "icons/icon.ico");
});

test("the macOS icon is an icns with the large sizes", () => {
  const icns = readFileSync(join(icons, "icon.icns"));
  assert.equal(icns.subarray(0, 4).toString(), "icns");
  const types = [];
  for (let at = 8; at < icns.length; ) {
    types.push(icns.subarray(at, at + 4).toString());
    at += icns.readUInt32BE(at + 4);
  }
  for (const t of ["ic07", "ic08", "ic09", "ic10"]) assert.ok(types.includes(t), `icon.icns lacks ${t}`);
});
