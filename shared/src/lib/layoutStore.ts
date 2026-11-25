// Session restore: the saved shape of a window (tabs, panes, folders) and its reading.
// Pure, so it is unit-tested; app.ts saves and rebuilds windows with it.

import * as L from "./layout.ts";

export interface SavedPane {
  profile: string;
  cwd: string;
}

export interface SavedTab {
  root: L.Node;
  active: string;
  title: string;
  icon: string;
  color: string;
}

export interface SavedLayout {
  version: 1;
  activeTab: number;
  tabs: SavedTab[];
  panes: Record<string, SavedPane>;
}

/** Reads a saved layout, or null when it is not one. */
export function parseLayout(raw: unknown): SavedLayout | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (!Array.isArray(v.tabs) || typeof v.panes !== "object" || v.panes === null) return null;
  const tabs: SavedTab[] = [];
  for (const t of v.tabs.slice(0, 50)) {
    if (typeof t !== "object" || t === null) continue;
    const x = t as Record<string, unknown>;
    const root = L.parseNode(x.root);
    if (!root) continue;
    tabs.push({
      root,
      active: typeof x.active === "string" ? x.active : "",
      title: typeof x.title === "string" ? x.title.slice(0, 80) : "",
      icon: typeof x.icon === "string" ? x.icon : "terminal",
      color: typeof x.color === "string" ? x.color : "",
    });
  }
  const panes: Record<string, SavedPane> = {};
  for (const [k, p] of Object.entries(v.panes as Record<string, unknown>)) {
    if (typeof p !== "object" || p === null) continue;
    const x = p as Record<string, unknown>;
    panes[k] = { profile: typeof x.profile === "string" ? x.profile : "", cwd: typeof x.cwd === "string" ? x.cwd : "" };
  }
  if (tabs.length === 0) return null;
  return { version: 1, activeTab: typeof v.activeTab === "number" ? Math.max(0, Math.floor(v.activeTab)) : 0, tabs, panes };
}

/** The tree with each leaf renamed through `ids`; leaves without a new id are dropped. */
export function renameLeaves(node: L.Node, ids: Map<string, string>, splitId: () => string): L.Node | null {
  if (node.type === "leaf") {
    const id = ids.get(node.id);
    return id ? L.leaf(id) : null;
  }
  const children: L.Node[] = [];
  const sizes: number[] = [];
  node.children.forEach((c, i) => {
    const r = renameLeaves(c, ids, splitId);
    if (r) {
      children.push(r);
      sizes.push(node.sizes[i]);
    }
  });
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  const total = sizes.reduce((a, b) => a + b, 0);
  return { ...node, id: splitId(), children, sizes: sizes.map((x) => x / total) };
}

