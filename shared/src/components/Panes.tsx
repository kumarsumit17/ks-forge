import { useLayoutEffect, useRef } from "react";
import { app, type Tab } from "../lib/app.ts";
import { useApp } from "../lib/useApp.ts";
import type { Node, Split } from "../lib/layout.ts";
import { SearchBar } from "./SearchBar.tsx";
import { t } from "../lib/i18n.ts";

/** Every tab's panes; only the active tab is shown, so the others keep their terminals. */
export function Workspace() {
  const s = useApp();
  return (
    <div className="workspace">
      {s.tabs.map((tab) => (
        <div key={tab.id} className="tab-panes" style={{ display: tab.id === s.activeTab ? "flex" : "none" }}>
          <PaneNode tab={tab} node={tab.zoomed ? { type: "leaf", id: tab.zoomed } : tab.root} />
        </div>
      ))}
    </div>
  );
}

function PaneNode({ tab, node }: { tab: Tab; node: Node }) {
  if (node.type === "leaf") return <Pane tab={tab} id={node.id} />;
  return <SplitView tab={tab} node={node} />;
}

function SplitView({ tab, node }: { tab: Tab; node: Split }) {
  const ref = useRef<HTMLDivElement>(null);
  const row = node.direction === "row";

  const startDrag = (i: number, e: React.PointerEvent) => {
    e.preventDefault();
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const total = row ? box.width : box.height;
    const start = row ? e.clientX : e.clientY;
    const sizes = [...node.sizes];
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const delta = ((row ? ev.clientX : ev.clientY) - start) / total;
      const next = [...sizes];
      const d = Math.max(-(sizes[i] - 0.08), Math.min(delta, sizes[i + 1] - 0.08));
      next[i] += d;
      next[i + 1] -= d;
      app.setSizes(tab.id, node.id, next);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      app.focusSoon();
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  return (
    <div ref={ref} className={"split " + node.direction}>
      {node.children.map((child, i) => (
        <div key={child.id} className="split-cell" style={{ flexGrow: node.sizes[i], flexBasis: 0 }}>
          <PaneNode tab={tab} node={child} />
          {i < node.children.length - 1 && <div className={"divider " + node.direction} onPointerDown={(e) => startDrag(i, e)} />}
        </div>
      ))}
    </div>
  );
}

function Pane({ tab, id }: { tab: Tab; id: string }) {
  const s = useApp();
  void s.revision;
  const host = useRef<HTMLDivElement>(null);
  const session = app.sessions.get(id);
  const active = tab.active === id;
  const many = tab.root.type === "split" && !tab.zoomed;

  useLayoutEffect(() => {
    const el = host.current;
    if (!el || !session) return;
    session.attach(el);
    return () => session.detach(el);
  }, [session]);

  return (
    <div className={"pane" + (active ? " active" : "") + (many ? " many" : "")} data-pane={id} onMouseDown={() => app.focusPane(id)}>
      <div ref={host} className="pane-host" />
      {session && !session.hasOutput && !session.exited && (
        <div className="pane-starting" aria-live="polite">
          {t("pane.starting", { name: session.profile.name })}
        </div>
      )}
      {active && s.searching && tab.id === s.activeTab && session && <SearchBar session={session} />}
    </div>
  );
}
