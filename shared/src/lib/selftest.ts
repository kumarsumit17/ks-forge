// The self-test (KS_FORGE_SELFTEST=1): drives the real app in its real window, the way a
// user would, and reports to Rust, which prints PASS or FAIL and exits. CI runs it on macOS
// and Windows; it never touches the user's settings (Rust gives it a temporary folder).

import { invoke } from "@tauri-apps/api/core";
import { app } from "./app.ts";
import { leaves } from "./layout.ts";
import { api, ipcStats } from "./tauri.ts";
import { getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { parseLayout } from "./layoutStore.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(what: string, ok: () => boolean | Promise<boolean>, ms = 15000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok()) return;
    await sleep(100);
  }
  throw new Error(`timed out: ${what}`);
}

function screenText(id: string): string {
  const s = app.sessions.get(id);
  if (!s) return "";
  const b = s.term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < b.length; i++) lines.push(b.getLine(i)?.translateToString(true) ?? "");
  return lines.join("\n");
}

export async function runSelfTest(): Promise<void> {
  if (!(await invoke<boolean>("selftest_enabled"))) return;
  const steps: string[] = [];
  let watched = "";
  const step = (s: string) => steps.push(s);
  try {
    const info = await api.appInfo();
    step(`platform=${info.platform} profiles=${app.state.settings.profiles.map((p) => p.id).join(",")}`);

    // 1. The first tab's shell starts and runs a command.
    const first = app.tab!;
    const pane = first.active;
    watched = pane;
    await until("shell started", () => app.sessions.get(pane)?.ptyId != null);
    // A first PowerShell start on a fresh Windows machine can take a while.
    await until("first prompt", () => !!app.sessions.get(pane)!.cwd, 60000);
    const firstPromptMs = await invoke<number>("app_uptime_ms");
    step(`renderer=${app.sessions.get(pane)!.renderer}`);
    const cmd = info.platform === "windows" ? "echo ksforge-%NUMBER_OF_PROCESSORS%x & echo ksforge-ok\r" : "echo ksforge-$((6*7))\r";
    const want = info.platform === "windows" ? "ksforge-ok" : "ksforge-42";
    await sleep(1500);
    await api.write(app.sessions.get(pane)!.ptyId!, cmd);
    await until(`output ${want}`, () => screenText(pane).split("\n").some((l) => l.trim() === want));
    step("shell output ok");
    // Shell integration reports the folder (OSC 7) and marks the prompt (OSC 133).
    await until("folder reported by shell integration", () => !!app.sessions.get(pane)!.cwd);
    step(`folder=${app.sessions.get(pane)!.cwd}`);
    step(`startup-to-prompt=${firstPromptMs}ms`);
    if (info.platform !== "windows") {
      // Output speed: a million lines through the PTY, the parser and the GPU renderer.
      const t0 = performance.now();
      await api.write(app.sessions.get(pane)!.ptyId!, "seq 1 1000000; echo ksforge-done\r");
      await until("a million lines", () => screenText(pane).split("\n").some((l) => l.trim() === "ksforge-done"), 60000);
      step(`million-lines=${Math.round(performance.now() - t0)}ms`);
      app.sessions.get(pane)!.clear();
    }

    // 2. Splits: right, then down, then moving focus and zooming.
    await app.run("splitRight");
    await app.run("splitDown");
    const panes = leaves(app.tab!.root);
    if (panes.length !== 3) throw new Error(`expected 3 panes, got ${panes.length}`);
    await until("all panes started", () => panes.every((p) => app.sessions.get(p)?.ptyId != null));
    await app.run("focusLeft");
    if (app.tab!.active !== pane) throw new Error("focusLeft did not reach the first pane");
    await app.run("zoomPane");
    if (app.tab!.zoomed !== pane) throw new Error("zoom failed");
    await app.run("zoomPane");
    step("splits, focus and zoom ok");

    // 3. Tabs: a second tab, switch back and forth, close it.
    await app.run("newTab");
    if (app.state.tabs.length !== 2) throw new Error("new tab failed");
    const second = app.state.activeTab;
    await app.run("prevTab");
    if (app.state.activeTab !== first.id) throw new Error("prevTab failed");
    await app.closeTab(second);
    if ((app.state.tabs.length as number) !== 1) throw new Error("close tab failed");
    step("tabs ok");

    // 4. Themes and settings: change the theme and font size; the file follows and the
    //    terminal takes the new colours.
    app.updateSettings({ followSystem: false, theme: "ember", fontSize: 15 });
    await until("settings written", async () => {
      const text = await api.readSettings();
      return !!text && JSON.parse(text).theme === "ember";
    });
    const bg = app.sessions.get(pane)!.term.options.theme?.background;
    if (bg !== "#1a1310") throw new Error(`theme not applied: ${bg}`);
    if (app.sessions.get(pane)!.term.options.fontSize !== 15) throw new Error("font size not applied");
    step("themes and settings ok");

    // 5. Windows: a second window opens with its own tabs, and closes again.
    const before = (await getAllWebviewWindows()).length;
    const label = await api.newWindow();
    await until("second window", async () => (await getAllWebviewWindows()).length === before + 1);
    const second2 = (await getAllWebviewWindows()).find((w) => w.label === label);
    await sleep(1500);
    await second2?.destroy();
    await until("second window closed", async () => (await getAllWebviewWindows()).length === before);
    step("windows ok");

    // 6. The layout saved for session restore reads back with every pane's profile and folder.
    const saved = parseLayout(JSON.parse(JSON.stringify(app.layout())));
    if (!saved || saved.tabs.length !== app.state.tabs.length) throw new Error("layout did not read back");
    if (saved.panes[pane]?.cwd !== app.sessions.get(pane)!.cwd) throw new Error("layout lost a folder");
    step("session layout ok");

    // 7. The running-program check (macOS: foreground process group; Windows: the shell's
    //    child processes), used before closing a pane.
    const sleeper = info.platform === "windows" ? "ping -n 8 127.0.0.1 > NUL\r" : "sleep 4\r";
    const ptyId = app.sessions.get(pane)!.ptyId!;
    await api.write(ptyId, sleeper);
    await until("running program seen", async () => (await api.busy([ptyId])).includes(ptyId), 10000);
    await until("program ended", async () => !(await api.busy([ptyId])).includes(ptyId), 20000);
    step("running-program check ok");

    // 8. This system's integrations: blur on and off, and the Dock menu (macOS) or the
    //    jump list and process list (Windows).
    await api.setBlur(true);
    await api.setBlur(false);
    const check = await (async () => {
      const end = Date.now() + 15000;
      let last = "";
      while (Date.now() < end) {
        last = await api.platformCheck();
        if (!last.includes("pending")) break;
        await sleep(300);
      }
      return last;
    })();
    if (info.platform === "macos" && !check.includes("dock=true")) throw new Error(`Dock menu missing: ${check}`);
    if (info.platform === "windows" && !(check.includes("jumplist=ok") && check.includes("processList=ok"))) throw new Error(`Windows integration: ${check}`);
    step(`platform ${check}`);

    // 9. Closing a pane gives its space back.
    await app.closePane(panes[2], true);
    if (leaves(app.tab!.root).length !== 2) throw new Error("close pane failed");
    step("close pane ok");

    await invoke("selftest_report", { ok: true, report: steps.join(" | ") });
  } catch (e) {
    // What the first pane showed, to tell a slow shell from a missing prompt report.
    const screen = watched ? JSON.stringify(screenText(watched).replace(/\n+$/, "").slice(-600)) : "";
    const s = watched ? app.sessions.get(watched) : undefined;
    const state = s ? `ipc=${JSON.stringify(ipcStats)} pty=${s.ptyId} exited=${s.exited} cwd=${JSON.stringify(s.cwd)} profile=${s.profile.program} ${s.profile.args.join(" ")}` : "";
    await invoke("selftest_report", { ok: false, report: `${steps.join(" | ")} | ERROR ${e instanceof Error ? e.message : String(e)} | ${state} | screen=${screen}` });
  }
}
