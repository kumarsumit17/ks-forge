import { test } from "node:test";
import assert from "node:assert/strict";
import { section, notes } from "../release-notes.mjs";

const log = "# Changelog\n\n## [0.2.0] - 2026-12-01\n\n- B\n\n## [0.1.0] - 2026-11-24\n\n- A\n";

test("the version's section is taken, and nothing of the next", () => {
  assert.equal(section(log, "0.1.0"), "- A");
  assert.equal(section(log, "0.2.0"), "- B");
  assert.throws(() => section(log, "0.3.0"));
  assert.match(notes(log, "0.1.0"), /ks-forge-v0\.1\.0-macos-arm64\.dmg/);
});
