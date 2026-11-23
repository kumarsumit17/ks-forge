// Runs the Tauri CLI with this system's settings from desktop/<system>/tauri.conf.json
// added to `dev` and `build` (specs/platform-folders.md: what is specific to one system
// lives in its folder). Run from shared/: `npm run tauri dev`, `npm run tauri build`.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const system = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : null;
const args = process.argv.slice(2);
const config = system && join(root, "desktop", system, "tauri.conf.json");
if (config && existsSync(config) && ["dev", "build"].includes(args[0]) && !args.includes("--config")) {
  args.splice(1, 0, "--config", config);
}
const cli = join(root, "shared", "node_modules", ".bin", process.platform === "win32" ? "tauri.cmd" : "tauri");
const r = spawnSync(cli, args, { stdio: "inherit", cwd: join(root, "shared"), shell: process.platform === "win32" });
process.exit(r.status ?? 1);
