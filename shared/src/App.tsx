import { useApp } from "./lib/useApp.ts";
import { TabBar } from "./components/TabBar.tsx";
import { Workspace } from "./components/Panes.tsx";
import { ContextMenu, DialogView, Notices, Palette } from "./components/Overlays.tsx";
import { SettingsView } from "./components/Settings.tsx";

export function App() {
  const s = useApp();
  if (!s.ready) return null;
  return (
    <div className="app">
      <TabBar />
      <Notices />
      <Workspace />
      {s.overlay === "palette" && <Palette />}
      {s.overlay === "settings" && <SettingsView />}
      <DialogView />
      <ContextMenu />
    </div>
  );
}
