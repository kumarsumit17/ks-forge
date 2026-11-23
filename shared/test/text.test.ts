import { test } from "node:test";
import assert from "node:assert/strict";
import { ligatureRanges, folderFromOsc7, fuzzyScore, pasteWarning, baseName } from "../src/lib/text.ts";

test("ligatures join common sequences but not runs of one character", () => {
  assert.deepEqual(ligatureRanges("a => b"), [[2, 4]]);
  assert.deepEqual(ligatureRanges("x !== y"), [[2, 5]]);
  assert.deepEqual(ligatureRanges("======"), []);
  assert.deepEqual(ligatureRanges("a -> b <= c"), [[2, 4], [7, 9]]);
});

test("OSC 7 folders are read on both systems", () => {
  assert.equal(folderFromOsc7("file://mac.local/Users/me/My%20Code"), "/Users/me/My Code");
  assert.equal(folderFromOsc7("file://host/Users/me/100%"), "/Users/me/100%");
  assert.equal(folderFromOsc7("file://PC/C:/Users/me"), "C:\\Users\\me");
  assert.equal(folderFromOsc7("http://x/y"), null);
});

test("fuzzy matching prefers word starts", () => {
  assert.ok(fuzzyScore("spr", "Split right") > fuzzyScore("spr", "Show prompt marks"));
  assert.equal(fuzzyScore("zz", "Split right"), -1);
  assert.equal(fuzzyScore("", "anything"), 0);
});

test("pastes with several lines or sudo are flagged", () => {
  assert.equal(pasteWarning("ls -la\n"), null);
  assert.equal(pasteWarning("a\nb"), "lines");
  assert.equal(pasteWarning("sudo rm -rf /tmp/x"), "sudo");
  assert.equal(pasteWarning("echo hi && sudo reboot"), "sudo");
  assert.equal(pasteWarning("pseudo thing"), null);
});

test("base names work for both path styles", () => {
  assert.equal(baseName("/Users/me/code/"), "code");
  assert.equal(baseName("C:\\Users\\me"), "me");
  assert.equal(baseName("/"), "/");
});

import { splitArgs, joinArgs } from "../src/lib/text.ts";

test("arguments are split and joined with quotes", () => {
  assert.deepEqual(splitArgs(`-l -c "echo hi" 'a b' ""`), ["-l", "-c", "echo hi", "a b", ""]);
  const args = ["-d", "Ubuntu 24", 'say "hi"', "C:\\path"];
  assert.deepEqual(splitArgs(joinArgs(args)), args);
});
