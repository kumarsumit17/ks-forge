import { useEffect, useRef, useState } from "react";
import { app } from "../lib/app.ts";
import type { Session } from "../lib/session.ts";
import { t } from "../lib/i18n.ts";
import { Icon } from "./Icon.tsx";

export function SearchBar({ session }: { session: Session }) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(() => session.term.getSelection().split("\n")[0] ?? "");
  const [opts, setOpts] = useState({ caseSensitive: false, wholeWord: false, regex: false });
  const [result, setResult] = useState({ index: -1, count: 0 });

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
    session.watchSearch((index, count) => setResult({ index, count }));
    return () => session.watchSearch(null);
  }, [session]);

  useEffect(() => {
    session.find(query, opts);
  }, [query, opts, session]);

  const toggle = (k: keyof typeof opts) => setOpts((o) => ({ ...o, [k]: !o[k] }));
  const status = !query ? "" : result.count === 0 ? t("search.none") : result.index >= 0 ? t("search.count", { index: result.index + 1, count: result.count }) : t("search.many", { count: result.count });

  return (
    <div className="searchbar" role="search" onMouseDown={(e) => e.stopPropagation()}>
      <Icon name="search" size={14} className="muted" />
      <input
        ref={input}
        value={query}
        placeholder={t("search.placeholder")}
        aria-label={t("search.placeholder")}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") session.find(query, opts, e.shiftKey);
          if (e.key === "Escape") app.setSearching(false);
        }}
      />
      <span className="search-status" aria-live="polite">{status}</span>
      <button className={"toggle" + (opts.caseSensitive ? " on" : "")} title={t("search.case")} aria-label={t("search.case")} aria-pressed={opts.caseSensitive} onClick={() => toggle("caseSensitive")}>
        <Icon name="case-sensitive" size={15} />
      </button>
      <button className={"toggle" + (opts.wholeWord ? " on" : "")} title={t("search.word")} aria-label={t("search.word")} aria-pressed={opts.wholeWord} onClick={() => toggle("wholeWord")}>
        <Icon name="whole-word" size={15} />
      </button>
      <button className={"toggle" + (opts.regex ? " on" : "")} title={t("search.regex")} aria-label={t("search.regex")} aria-pressed={opts.regex} onClick={() => toggle("regex")}>
        <Icon name="regex" size={15} />
      </button>
      <button className="icon-button" title={t("search.prev")} aria-label={t("search.prev")} onClick={() => session.find(query, opts, true)}>
        <Icon name="arrow-up" size={14} />
      </button>
      <button className="icon-button" title={t("search.next")} aria-label={t("search.next")} onClick={() => session.find(query, opts)}>
        <Icon name="arrow-down" size={14} />
      </button>
      <button className="icon-button" title={t("common.close")} aria-label={t("common.close")} onClick={() => app.setSearching(false)}>
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}
