import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setVersion, versionOf, edits } from "../set-version.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("only plain release tags are versions", () => {
  assert.equal(versionOf("v1.2.3"), "1.2.3");
  for (const bad of ["1.2.3", "v1.2", "v1.2.3-beta", "v01.2.3", "", undefined]) assert.throws(() => versionOf(bad));
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
    assert.match(readFileSync(join(dir, "shared/src-tauri/Cargo.toml"), "utf8"), /\nversion = "0\.1\.0"\n/);
    assert.match(readFileSync(join(dir, "shared/src-tauri/Cargo.lock"), "utf8"), /name = "ks-forge"\nversion = "0\.1\.0"\n/);
    assert.throws(() => setVersion("v0.1.1", dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
