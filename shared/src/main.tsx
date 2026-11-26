import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { App } from "./App.tsx";
import { app } from "./lib/app.ts";
import { errorText } from "./lib/i18n.ts";
import { runSelfTest } from "./lib/selftest.ts";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void import("@tauri-apps/api/core").then(({ invoke }) => invoke("selftest_progress", { step: "page loaded" }).catch(() => {}));

app
  .start()
  .then(runSelfTest)
  .catch((e) => {
    // In the self-test a start-up error is its result (CI shows it).
    void import("@tauri-apps/api/core").then(({ invoke }) => invoke("selftest_report", { ok: false, report: `start-up failed: ${errorText(e)}` }));
  document.body.textContent = errorText(e);
  console.error(e);
});
