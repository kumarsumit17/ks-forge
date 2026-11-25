import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setVersion, versionOf, edits, platformOf, tooLow } from "../set-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("plain and platform tags are versions", () => {
  assert.equal(versionOf("v1.2.3"), "1.2.3");
  assert.equal(versionOf("mac-v0.3.0"), "0.3.0");
  assert.equal(versionOf("windows-v0.4.0"), "0.4.0");
  assert.equal(platformOf("v1.2.3"), "all");
  assert.equal(platformOf("mac-v1.2.3"), "mac");
  for (const bad of ["1.2.3", "v1.2", "v1.2.3-beta", "v01.2.3", "android-v1.0.0", "mac-1.0.0", "", undefined]) assert.throws(() => versionOf(bad));
});

test("a new tag is higher than its platform's tags and every plain tag", () => {
  const tags = ["v0.1.0", "v0.2.0", "mac-v0.3.0"];
  assert.equal(tooLow("mac-v0.4.0", tags), null);
  assert.equal(tooLow("windows-v0.3.0", tags), null);
  assert.match(tooLow("mac-v0.2.5", tags), /higher than mac-v0\.3\.0/);
  assert.match(tooLow("windows-v0.2.0", tags), /higher than v0\.2\.0/);
  assert.match(tooLow("v0.3.0", tags), /higher than mac-v0\.3\.0/);
  assert.equal(tooLow("v0.4.0", tags), null);
});

test("the version goes into every file, and a second run changes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "ksforge-version-"));
  try {
    for (const [rel] of edits("0.0.0")) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      cpSync(join(root, rel), join(dir, rel));
    }
    assert.equal(setVersion("v0.1.0", dir), "0.1.0");
    assert.equal(JSON.parse(readFileSync(join(dir, "shared/package.json"), "utf8")).version, "0.1.0");
    assert.equal(JSON.parse(readFileSync(join(dir, "shared/src-tauri/tauri.conf.json"), "utf8")).version, "0.1.0");
    assert.match(readFileSync(join(dir, "shared/src-tauri/Cargo.toml"), "utf8"), /\r?\nversion = "0\.1\.0"\r?\n/);
    assert.match(readFileSync(join(dir, "shared/src-tauri/Cargo.lock"), "utf8"), /name = "ks-forge"\r?\nversion = "0\.1\.0"\r?\n/);
    assert.throws(() => setVersion("v0.1.1", dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
