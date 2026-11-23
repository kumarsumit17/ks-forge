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

app
  .start()
  .then(runSelfTest)
  .catch((e) => {
  document.body.textContent = errorText(e);
  console.error(e);
});
