// Split panes (specs/plan.md, 3): a tab's panes form a tree. A leaf is one terminal; a split
// lays its children out side by side ("row") or one above the other ("column"), with sizes
// as fractions that add up to 1. Every function here returns a new tree.

export type Direction = "row" | "column";

export interface Leaf {
  type: "leaf";
  id: string;
}

export interface Split {
  type: "split";
  id: string;
  direction: Direction;
  children: Node[];
  sizes: number[];
}

export type Node = Leaf | Split;

export type Side = "left" | "right" | "up" | "down";

export const MIN_SIZE = 0.08;

export function leaf(id: string): Leaf {
  return { type: "leaf", id };
}

export function leaves(node: Node): string[] {
  return node.type === "leaf" ? [node.id] : node.children.flatMap(leaves);
}

export function contains(node: Node, id: string): boolean {
  return leaves(node).includes(id);
}

/** Splits pane `target` in `direction`, putting `added` after it (right or below). */
export function split(node: Node, target: string, direction: Direction, added: string, splitId: string): Node {
  if (node.type === "leaf") {
    if (node.id !== target) return node;
    return { type: "split", id: splitId, direction, children: [node, leaf(added)], sizes: [0.5, 0.5] };
  }
  const i = node.children.findIndex((c) => c.type === "leaf" && c.id === target);
  if (i >= 0 && node.direction === direction) {
    // Same direction: the new pane shares the target's space instead of nesting.
    const children = [...node.children];
    const sizes = [...node.sizes];
    const half = sizes[i] / 2;
    children.splice(i + 1, 0, leaf(added));
    sizes.splice(i, 1, half, half);
    return { ...node, children, sizes };
  }
  return { ...node, children: node.children.map((c) => split(c, target, direction, added, splitId)) };
}

/** Removes pane `target`; its space goes to its neighbours. Null when the tree is now empty. */
export function remove(node: Node, target: string): Node | null {
  if (node.type === "leaf") return node.id === target ? null : node;
  const children: Node[] = [];
  const sizes: number[] = [];
  node.children.forEach((c, i) => {
    const r = remove(c, target);
    if (r) {
      children.push(r);
      sizes.push(node.sizes[i]);
    }
  });
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  const total = sizes.reduce((a, b) => a + b, 0) || 1;
  const scaled = sizes.map((s) => s / total);
  return { ...node, children, sizes: scaled };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Each pane's place in a unit square. */
export function rects(node: Node, r: Rect = { x: 0, y: 0, w: 1, h: 1 }, out = new Map<string, Rect>()): Map<string, Rect> {
  if (node.type === "leaf") {
    out.set(node.id, r);
    return out;
  }
  let offset = 0;
  node.children.forEach((c, i) => {
    const s = node.sizes[i];
    const cr = node.direction === "row" ? { x: r.x + offset * r.w, y: r.y, w: s * r.w, h: r.h } : { x: r.x, y: r.y + offset * r.h, w: r.w, h: s * r.h };
    rects(c, cr, out);
    offset += s;
  });
  return out;
}

/** The pane next to `from` on `side`: the nearest that overlaps it most along the other axis. */
export function neighbour(node: Node, from: string, side: Side): string | null {
  const all = rects(node);
  const a = all.get(from);
  if (!a) return null;
  const eps = 1e-6;
  let best: string | null = null;
  let bestScore = -Infinity;
  for (const [id, b] of all) {
    if (id === from) continue;
    let gap: number;
    let overlap: number;
    if (side === "left" || side === "right") {
      gap = side === "left" ? a.x - (b.x + b.w) : b.x - (a.x + a.w);
      overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    } else {
      gap = side === "up" ? a.y - (b.y + b.h) : b.y - (a.y + a.h);
      overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    }
    if (gap < -eps || overlap <= eps) continue;
    const score = overlap - gap * 10;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/** Moves the edge of pane `target` on `side` by `delta` (a fraction of the split it is in). */
export function resize(node: Node, target: string, side: Side, delta: number): Node {
  const direction: Direction = side === "left" || side === "right" ? "row" : "column";
  const grow = side === "right" || side === "down";
  const go = (n: Node): Node => {
    if (n.type === "leaf") return n;
    const i = n.children.findIndex((c) => contains(c, target));
    if (i < 0) return n;
    const inner = go(n.children[i]);
    if (inner !== n.children[i]) {
      const children = [...n.children];
      children[i] = inner;
      return { ...n, children };
    }
    if (n.direction !== direction) return n;
    // The edge between child i and its neighbour on that side.
    const j = grow ? i + 1 : i - 1;
    if (j < 0 || j >= n.children.length) return n;
    const sizes = [...n.sizes];
    const d = Math.max(-(sizes[i] - MIN_SIZE), Math.min(delta, sizes[j] - MIN_SIZE));
    sizes[i] += d;
    sizes[j] -= d;
    return { ...n, sizes };
  };
  return go(node);
}

/** Sets the sizes of split `splitId` (from dragging a divider). */
export function setSizes(node: Node, splitId: string, sizes: number[]): Node {
  if (node.type === "leaf") return node;
  if (node.id === splitId && sizes.length === node.children.length) {
    const clamped = sizes.map((s) => Math.max(MIN_SIZE, s));
    const total = clamped.reduce((a, b) => a + b, 0);
    return { ...node, sizes: clamped.map((s) => s / total) };
  }
  return { ...node, children: node.children.map((c) => setSizes(c, splitId, sizes)) };
}

/** Gives every pane in each split the same space. */
export function equalize(node: Node): Node {
  if (node.type === "leaf") return node;
  const n = node.children.length;
  return { ...node, children: node.children.map(equalize), sizes: node.children.map(() => 1 / n) };
}

/** Reads a tree from saved data, or null when it is not a valid one. */
export function parseNode(value: unknown, depth = 0): Node | null {
  if (depth > 16 || typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string") return null;
  if (v.type === "leaf") return leaf(v.id);
  if (v.type !== "split" || (v.direction !== "row" && v.direction !== "column") || !Array.isArray(v.children) || !Array.isArray(v.sizes)) return null;
  const children = v.children.map((c) => parseNode(c, depth + 1));
  if (children.length < 2 || children.some((c) => c === null) || v.sizes.length !== children.length) return null;
  if (!v.sizes.every((s) => typeof s === "number" && s > 0)) return null;
  const total = (v.sizes as number[]).reduce((a, b) => a + b, 0);
  return { type: "split", id: v.id, direction: v.direction, children: children as Node[], sizes: (v.sizes as number[]).map((s) => s / total) };
}
