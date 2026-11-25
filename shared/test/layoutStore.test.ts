import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLayout, renameLeaves } from "../src/lib/layoutStore.ts";
import { leaf, split, leaves } from "../src/lib/layout.ts";

test("a saved layout is read back, and broken parts are left out", () => {
  const root = split(split(leaf("a"), "a", "row", "b", "s1"), "b", "column", "c", "s2");
  const saved = { version: 1, activeTab: 1, tabs: [{ root, active: "b", title: "api", icon: "server", color: "#7aa7ff" }, { root: "broken" }], panes: { a: { profile: "zsh", cwd: "/x" }, b: { profile: "bash", cwd: "" }, c: 3 } };
  const p = parseLayout(JSON.parse(JSON.stringify(saved)))!;
  assert.equal(p.tabs.length, 1);
  assert.equal(p.tabs[0].title, "api");
  assert.deepEqual(p.panes.a, { profile: "zsh", cwd: "/x" });
  assert.equal(p.panes.c, undefined);
  assert.equal(parseLayout({ tabs: [], panes: {} }), null);
  assert.equal(parseLayout(null), null);
});

test("panes get new ids, and a pane that could not start is dropped", () => {
  const root = split(split(leaf("a"), "a", "row", "b", "s1"), "b", "column", "c", "s2");
  let n = 0;
  const renamed = renameLeaves(root, new Map([["a", "x"], ["c", "z"]]), () => `n${++n}`)!;
  assert.deepEqual(leaves(renamed), ["x", "z"]);
  assert.equal(renameLeaves(leaf("q"), new Map(), () => "s"), null);
});
