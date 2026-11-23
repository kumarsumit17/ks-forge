import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, parseFile, serialize, defaults, fontStack, activeThemeId } from "../src/lib/settings.ts";
import { parseTheme, BUILT_IN_THEMES, COLOR_KEYS } from "../src/lib/themes.ts";

const zsh = { id: "zsh", name: "zsh", program: "/bin/zsh", args: ["-l"], icon: "terminal", default: true };
const bash = { id: "bash", name: "bash", program: "/bin/bash", args: ["-l"], icon: "square-terminal", default: false };

test("an empty file gives the defaults and the found shells", () => {
  const { settings, problems } = normalize(parseFile(null), [bash, zsh], "macos");
  assert.deepEqual(problems, []);
  assert.equal(settings.defaultProfile, "zsh");
  assert.deepEqual(settings.profiles.map((p) => p.id), ["bash", "zsh"]);
  assert.equal(settings.fontSize, defaults("macos").fontSize);
});

test("wrong values take their defaults and are reported", () => {
  const { settings, problems } = normalize({ fontSize: 400, theme: 3, cursorStyle: "box", padding: 4.6, profiles: [{ id: "x" }] }, [zsh], "macos");
  assert.equal(settings.fontSize, 13);
  assert.equal(settings.padding, 5);
  assert.deepEqual(problems.sort(), ["cursorStyle", "fontSize", "profiles", "theme"]);
});

test("a hidden found shell stays hidden, and a user profile keeps its place", () => {
  const raw = { hiddenProfiles: ["bash"], profiles: [{ id: "work", name: "Work", program: "/bin/zsh", args: ["-l"], env: { A: "1", "bad name": "x" } }], defaultProfile: "work" };
  const { settings } = normalize(raw, [zsh, bash], "macos");
  assert.deepEqual(settings.profiles.map((p) => p.id), ["work", "zsh"]);
  assert.deepEqual(settings.profiles[0].env, { A: "1" });
  assert.equal(settings.defaultProfile, "work");
});

test("a broken file is not read, so the last good settings stay", () => {
  assert.equal(parseFile("{ nope"), null);
  const s = normalize({ fontSize: 15 }, [], "windows").settings;
  assert.equal(normalize(JSON.parse(serialize(s)), [], "windows").settings.fontSize, 15);
});

test("font lists keep the user's font first and quote names", () => {
  assert.equal(fontStack("Fira Code", "macos"), '"Fira Code", ui-monospace, "Menlo", monospace');
  assert.equal(fontStack("Cascadia Mono, Consolas", "windows"), '"Cascadia Mono", "Consolas", monospace');
});

test("themes follow the system when asked", () => {
  const s = defaults("macos");
  assert.equal(activeThemeId(s, true), s.darkTheme);
  assert.equal(activeThemeId(s, false), s.lightTheme);
  assert.equal(activeThemeId({ ...s, followSystem: false, theme: "ember" }, false), "ember");
});

test("built-in themes are complete and imported ones are checked", () => {
  const ids = new Set<string>();
  for (const t of BUILT_IN_THEMES) {
    assert.ok(parseTheme(t), t.id);
    assert.ok(!ids.has(t.id));
    ids.add(t.id);
  }
  assert.ok(BUILT_IN_THEMES.length >= 8);
  const bad = { ...BUILT_IN_THEMES[0], id: "mine", red: "red" };
  assert.equal(parseTheme(bad), null);
  assert.equal(COLOR_KEYS.length, 21);
});
