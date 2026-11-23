import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { app } from "../lib/app.ts";
import { useApp } from "../lib/useApp.ts";
import { t, tk } from "../lib/i18n.ts";
import { ACTIONS, display, effectiveBindings, type ActionId } from "../lib/keys.ts";
import { fuzzyScore } from "../lib/text.ts";
import { Icon } from "./Icon.tsx";

export function Palette() {
  const s = useApp();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const bindings = effectiveBindings(s.settings.keybindings, s.platform);

  const items = useMemo(() => {
    const all: { id: string; label: string; hint: string; run: () => void }[] = [];
    for (const a of ACTIONS) {
      if (/^goToTab[2-8]$/.test(a)) continue;
      all.push({ id: a, label: tk(`action.${a}`), hint: display(bindings[a as ActionId], s.platform), run: () => void app.run(a) });
    }
    for (const p of s.settings.profiles) {
      all.push({ id: `profile:${p.id}`, label: t("palette.newTabWith", { name: p.name }), hint: "", run: () => app.newTab(p.id) });
    }
    for (const th of app.allThemes()) {
      all.push({ id: `theme:${th.id}`, label: t("palette.theme", { name: th.name }), hint: "", run: () => app.updateSettings({ followSystem: false, theme: th.id }) });
    }
    if (!query.trim()) return all.filter((x) => !x.id.startsWith("theme:"));
    return all
      .map((x) => ({ x, score: fuzzyScore(query, x.label) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.x);
  }, [query, s.settings, s.platform]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setIndex(0), [query]);
  useLayoutEffect(() => {
    list.current?.querySelector(".palette-item.selected")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const choose = (i: number) => {
    const item = items[i];
    if (!item) return;
    app.closeOverlay();
    item.run();
  };

  return (
    <div className="scrim" onMouseDown={() => app.closeOverlay()}>
      <div className="palette" role="dialog" aria-label={t("action.palette")} onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="palette-input"
          placeholder={t("palette.placeholder")}
          aria-label={t("palette.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, items.length - 1));
            else if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
            else if (e.key === "Enter") choose(index);
            else if (e.key === "Escape") app.closeOverlay();
            else return;
            e.preventDefault();
          }}
        />
        <div className="palette-list" ref={list} role="listbox">
          {items.length === 0 && <div className="palette-empty">{t("palette.none")}</div>}
          {items.map((item, i) => (
            <div
              key={item.id}
              role="option"
              aria-selected={i === index}
              className={"palette-item" + (i === index ? " selected" : "")}
              onMouseMove={() => setIndex(i)}
              onClick={() => choose(i)}
            >
              <span>{item.label}</span>
              {item.hint && <kbd>{item.hint}</kbd>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DialogView() {
  const { dialog } = useApp();
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => ok.current?.focus(), [dialog]);
  if (!dialog) return null;
  return (
    <div className="scrim" onMouseDown={() => dialog.resolve(false)}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") dialog.resolve(false);
        }}
      >
        <h2 id="dialog-title">{dialog.title}</h2>
        <p>{dialog.body}</p>
        {dialog.detail && <pre className="dialog-detail">{dialog.detail}</pre>}
        <div className="dialog-buttons">
          <button className="button" onClick={() => dialog.resolve(false)}>
            {dialog.cancel ?? t("common.cancel")}
          </button>
          <button ref={ok} className={"button primary" + (dialog.danger ? " danger" : "")} onClick={() => dialog.resolve(true)}>
            {dialog.ok}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ContextMenu() {
  const { menu } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(menu.x, innerWidth - r.width - 4)), top: Math.max(4, Math.min(menu.y, innerHeight - r.height - 4)) });
  }, [menu]);
  if (!menu) return null;
  const grid = menu.items.every((i) => i !== "separator" && (i.label.startsWith("icon:") || i.label.startsWith("color:")));
  return (
    <div className="menu-catcher" onMouseDown={() => app.showMenu(null)} onContextMenu={(e) => { e.preventDefault(); app.showMenu(null); }}>
      <div
        ref={ref}
        className={"menu" + (grid ? " grid" : "")}
        role="menu"
        style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? "visible" : "hidden" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {menu.items.map((item, i) => {
          if (item === "separator") return <div key={i} className="menu-separator" role="separator" />;
          const choose = () => {
            app.showMenu(null);
            item.run();
            app.focusSoon();
          };
          if (item.label.startsWith("icon:")) {
            const name = item.label.slice(5);
            return (
              <button key={i} className="menu-cell" role="menuitem" aria-label={name} onClick={choose}>
                <Icon name={name} size={16} />
              </button>
            );
          }
          if (item.label.startsWith("color:")) {
            const c = item.label.slice(6);
            return (
              <button key={i} className="menu-cell" role="menuitem" aria-label={c || t("tab.noColor")} onClick={choose}>
                <span className="swatch" style={{ background: c || "transparent" }} />
              </button>
            );
          }
          return (
            <button key={i} className={"menu-item" + (item.danger ? " danger" : "")} role="menuitem" onClick={choose}>
              <span>{item.label}</span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Notices() {
  const s = useApp();
  const u = useUpdates();
  return (
    <div className="notices">
      {s.fileBroken && (
        <div className="notice warn" role="status">
          <Icon name="triangle-alert" size={14} />
          <span>{t("notice.fileBroken")}</span>
          <button className="link" onClick={() => void app.run("openSettingsFile")}>{t("action.openSettingsFile")}</button>
        </div>
      )}
      {!s.fileBroken && s.problems.length > 0 && (
        <div className="notice warn" role="status">
          <Icon name="triangle-alert" size={14} />
          <span>{t("notice.problems", { names: s.problems.join(", ") })}</span>
          <button className="link" onClick={() => app.updateSettings({})}>{t("notice.fix")}</button>
        </div>
      )}
      {app.updates.showBanner() && u.available && (
        <div className="notice" role="status">
          <Icon name="download" size={14} />
          <span>{t("common.appUpdate.available", { version: u.available.version })}</span>
          <button className="link" onClick={() => app.openOverlay("settings", "updates")}>{t("notice.seeUpdate")}</button>
          <button className="link" onClick={() => app.updates.dismiss()}>{t("common.appUpdate.later")}</button>
        </div>
      )}
      {s.toast && (
        <div className="toast" role="status">
          {s.toast}
        </div>
      )}
    </div>
  );
}

export function useUpdates() {
  return useSyncExternalStore(app.updates.subscribe, app.updates.getState);
}
