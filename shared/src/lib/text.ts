// Small text helpers for the terminal: ligatures, OSC 7 folders, fuzzy matching, paste checks.

/**
 * Character sequences drawn as one ligature when the font has one ("=>", "!=", "->", …).
 * xterm.js draws each cell alone; joining these lets the font's ligature show (the WebGL
 * renderer draws a joined run as one string). Our own list of common programming ligatures.
 */
export const LIGATURES = [
  "<!--", "===", "!==", "<=>", "...", "->>", "<<-", "|||", "&&&", "::=", "=>>", "<<=", ">>=",
  "=>", "->", "<-", "<=", ">=", "==", "!=", "&&", "||", "::", "++", "--", "**", "//", "/*", "*/",
  "<<", ">>", "|>", "<|", "..", "?.", "??", "#{", "#[", "</", "/>", "<>", ":=", "=<", "~>", "<~",
];

const BY_LENGTH = [...LIGATURES].sort((a, b) => b.length - a.length);

/** The [start, end) ranges of `text` to draw joined. */
export function ligatureRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  while (i < text.length) {
    const hit = BY_LENGTH.find((l) => text.startsWith(l, i));
    if (hit) {
      // A run of the same character ("=====", "-----") is a line, not a ligature.
      const prev = text[i - 1];
      const next = text[i + hit.length];
      if (prev !== hit[0] && next !== hit[hit.length - 1]) {
        out.push([i, i + hit.length]);
        i += hit.length;
        continue;
      }
    }
    i++;
  }
  return out;
}

/** The folder in an OSC 7 report ("file://host/path"), or null. Windows paths lose the leading slash. */
export function folderFromOsc7(data: string): string | null {
  const m = /^file:\/\/[^/]*(\/.*)$/.exec(data.trim());
  if (!m) return null;
  let path = m[1];
  try {
    path = decodeURIComponent(path);
  } catch {
    // Not percent-encoded: keep it as sent.
  }
  if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1).replace(/\//g, "\\");
  return path;
}

/**
 * How well `query` matches `text`, or -1: all query characters in order, with a bonus for
 * matches at word starts and in a row, so "spr" ranks "Split right" first.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const t = text.toLowerCase();
  let score = 0;
  let ti = 0;
  let last = -2;
  for (const ch of q) {
    if (ch === " ") continue;
    const at = t.indexOf(ch, ti);
    if (at < 0) return -1;
    const wordStart = at === 0 || /[\s:/._-]/.test(t[at - 1]);
    score += 1 + (wordStart ? 3 : 0) + (at === last + 1 ? 2 : 0);
    last = at;
    ti = at + 1;
  }
  return score - t.length * 0.01;
}

/** Why a paste needs a look first: several lines, or a command run as administrator. */
export function pasteWarning(text: string): "lines" | "sudo" | null {
  const body = text.replace(/[\r\n]+$/, "");
  if (/[\r\n]/.test(body)) return "lines";
  if (/(^|[;&|]\s*)sudo\s/.test(body)) return "sudo";
  return null;
}

/** The last part of a folder path, for tab titles. */
export function baseName(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** Splits an arguments line the way a shell would for simple quoting: spaces, '…' and "…". */
export function splitArgs(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && (line[i + 1] === '"' || line[i + 1] === "\\")) cur += line[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur);
      cur = "";
      has = false;
    } else {
      cur += c;
    }
  }
  if (has || cur) out.push(cur);
  return out;
}

/** The arguments as one line, quoted where needed, so splitArgs reads them back. */
export function joinArgs(args: string[]): string {
  return args.map((a) => (a === "" || /[\s"']/.test(a) ? `"${a.replace(/(["\\])/g, "\\$1")}"` : a)).join(" ");
}
