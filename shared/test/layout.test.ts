import { test } from "node:test";
import assert from "node:assert/strict";
import { leaf, split, remove, leaves, neighbour, resize, equalize, setSizes, parseNode, type Node } from "../src/lib/layout.ts";

test("splitting in the same direction shares the space instead of nesting", () => {
  let t: Node = leaf("a");
  t = split(t, "a", "row", "b", "s1");
  t = split(t, "b", "row", "c", "s2");
  assert.equal(t.type, "split");
  if (t.type !== "split") return;
  assert.deepEqual(leaves(t), ["a", "b", "c"]);
  assert.deepEqual(t.sizes, [0.5, 0.25, 0.25]);
});

test("removing a pane gives its space to the others and collapses single children", () => {
  let t: Node = split(leaf("a"), "a", "row", "b", "s1");
  t = split(t, "b", "column", "c", "s2");
  const r = remove(t, "b");
  assert.ok(r && r.type === "split");
  assert.deepEqual(leaves(r!), ["a", "c"]);
  assert.equal(remove(leaf("a"), "a"), null);
  const one = remove(split(leaf("a"), "a", "row", "b", "s"), "a");
  assert.deepEqual(one, leaf("b"));
});

test("neighbours are found by place, also across nested splits", () => {
  // a | (b over c)
  let t: Node = split(leaf("a"), "a", "row", "b", "s1");
  t = split(t, "b", "column", "c", "s2");
  assert.equal(neighbour(t, "a", "right"), "b");
  assert.equal(neighbour(t, "c", "left"), "a");
  assert.equal(neighbour(t, "b", "down"), "c");
  assert.equal(neighbour(t, "c", "up"), "b");
  assert.equal(neighbour(t, "a", "left"), null);
});

test("resizing moves the right edge and keeps a minimum size", () => {
  let t: Node = split(leaf("a"), "a", "row", "b", "s1");
  t = resize(t, "a", "right", 0.1);
  assert.ok(t.type === "split");
  if (t.type !== "split") return;
  assert.ok(Math.abs(t.sizes[0] - 0.6) < 1e-9);
  const big = resize(t, "a", "right", 5);
  assert.ok(big.type === "split" && Math.abs(big.sizes[1] - 0.08) < 1e-9);
  const eq = equalize(big);
  assert.ok(eq.type === "split" && eq.sizes[0] === 0.5);
  const set = setSizes(eq, "s1", [3, 1]);
  assert.ok(set.type === "split" && set.sizes[0] === 0.75);
});

test("saved trees are read back and broken ones refused", () => {
  const t = split(leaf("a"), "a", "row", "b", "s1");
  assert.deepEqual(parseNode(JSON.parse(JSON.stringify(t))), t);
  assert.equal(parseNode({ type: "split", id: "x", direction: "row", children: [{ type: "leaf", id: "a" }], sizes: [1] }), null);
  assert.equal(parseNode("nope"), null);
});
