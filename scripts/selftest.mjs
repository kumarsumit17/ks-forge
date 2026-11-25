// Runs the app's self-test (KS_FORGE_SELFTEST=1) on a built or installed copy, with a time
// limit, on macOS and Windows alike (macOS has no `timeout` command). Prints the app's
// KS_FORGE_SELFTEST line and exits 0 only on PASS.
//
//   node scripts/selftest.mjs <path to the app's executable> [seconds]
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [exe, seconds = "180"] = process.argv.slice(2);
if (!exe) {
  console.error("usage: node scripts/selftest.mjs <executable> [seconds]");
  process.exit(2);
}
const dir = mkdtempSync(join(tmpdir(), "ksforge-selftest-"));
const resultFile = join(dir, "result.txt");
const started = Date.now();
const child = spawn(exe, [], { env: { ...process.env, KS_FORGE_SELFTEST: "1", KS_FORGE_SELFTEST_OUT: resultFile }, stdio: ["ignore", "pipe", "pipe"] });
let out = "";
child.stdout.on("data", (d) => (out += d));
child.stderr.on("data", (d) => (out += d));
const timer = setTimeout(() => {
  out += `\n(timed out after ${seconds} s)`;
  child.kill();
}, Number(seconds) * 1000);
child.on("error", (e) => {
  clearTimeout(timer);
  console.error(`could not start ${exe}: ${e.message}`);
  process.exit(1);
});
child.on("close", (code, signal) => {
  clearTimeout(timer);
  try {
    out += "\n" + readFileSync(resultFile, "utf8");
  } catch {
    // No file: the app ended before reporting.
  }
  rmSync(dir, { recursive: true, force: true });
  const line = out.split(/\r?\n/).find((l) => l.startsWith("KS_FORGE_SELFTEST "));
  if (line?.startsWith("KS_FORGE_SELFTEST PASS")) {
    console.log(line);
    process.exit(0);
  }
  console.error(line ?? `no self-test result (exit code ${code}, signal ${signal}, after ${Date.now() - started} ms)`);
  console.error(out.split(/\r?\n/).slice(-30).join("\n"));
  process.exit(1);
});
