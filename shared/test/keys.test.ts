import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, fromEvent, display, bindingTable, conflicts, defaultBindings, ACTIONS } from "../src/lib/keys.ts";

const ev = (code: string, key: string, m: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) => ({
  code, key, ctrlKey: !!m.ctrl, altKey: !!m.alt, shiftKey: !!m.shift, metaKey: !!m.meta,
});

test("shortcuts are written in any order and case", () => {
  assert.equal(normalize("Cmd+Shift+T", "macos"), "shift+cmd+t");
  assert.equal(normalize("shift+command+t", "macos"), "shift+cmd+t");
  assert.equal(normalize("mod+d", "macos"), "cmd+d");
  assert.equal(normalize("mod+d", "windows"), "ctrl+d");
  assert.equal(normalize("Ctrl+Alt+ArrowLeft", "windows"), "ctrl+alt+left");
  assert.equal(normalize("cmd++", "macos"), "cmd+=");
  assert.equal(normalize("ctrl+a+b", "windows"), null);
  assert.equal(normalize("shift", "windows"), null);
});

test("key presses are read from the physical key", () => {
  assert.equal(fromEvent(ev("KeyT", "T", { meta: true, shift: true })), "shift+cmd+t");
  assert.equal(fromEvent(ev("Digit1", "!", { ctrl: true, alt: true })), "ctrl+alt+1");
  assert.equal(fromEvent(ev("ArrowLeft", "ArrowLeft", { alt: true, meta: true })), "alt+cmd+left");
  assert.equal(fromEvent(ev("Equal", "=", { meta: true })), "cmd+=");
  assert.equal(fromEvent(ev("ShiftLeft", "Shift", { shift: true })), null);
});

test("shortcuts are shown the way each system writes them", () => {
  assert.equal(display("shift+cmd+t", "macos"), "⇧⌘T");
  assert.equal(display("ctrl+shift+t", "windows"), "Ctrl+Shift+T");
  assert.equal(display("ctrl+alt+left", "windows"), "Ctrl+Alt+←");
});

test("every default is a valid shortcut with no clashes on either system", () => {
  for (const p of ["macos", "windows"] as const) {
    for (const [a, b] of Object.entries(defaultBindings(p))) {
      assert.ok(ACTIONS.includes(a as never), a);
      assert.ok(normalize(b!, p), `${p} ${a} ${b}`);
    }
    assert.equal(conflicts({}, p).size, 0, p);
  }
});

test("the user's shortcuts replace and remove defaults", () => {
  const t = bindingTable({ splitRight: "cmd+e", newTab: "" }, "macos");
  assert.equal(t.get("cmd+e"), "splitRight");
  assert.equal(t.get("cmd+d"), undefined);
  assert.equal(t.get("cmd+t"), undefined);
  const c = conflicts({ splitRight: "cmd+t" }, "macos");
  assert.ok(c.has("splitRight") && c.has("newTab"));
  assert.equal(bindingTable({ splitRight: "cmd+t" }, "macos").get("cmd+t"), "splitRight");
});
