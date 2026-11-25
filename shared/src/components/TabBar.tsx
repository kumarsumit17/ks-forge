import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { app, type Tab } from "../lib/app.ts";
import { useApp } from "../lib/useApp.ts";
import { t } from "../lib/i18n.ts";
import { display } from "../lib/keys.ts";
import { effectiveBindings } from "../lib/keys.ts";
import { TAB_COLORS, TAB_ICONS } from "../lib/settings.ts";
import { Icon } from "./Icon.tsx";

export function TabBar() {
  const s = useApp();
  // Tabs are reordered by pointer, not HTML drag and drop (which the window's file-drop
  // handling takes over on Windows).
  const drag = useRef<{ from: number; x: number; moved: boolean } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const indexAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest("[data-tab-index]");
    return el ? Number(el.getAttribute("data-tab-index")) : null;
  };
  const bindings = effectiveBindings(s.settings.keybindings, s.platform);

  const profileMenu = (x: number, y: number) =>
    app.showMenu({
      x,
      y,
      items: s.settings.profiles.map((p) => ({ label: p.name, run: () => app.newTab(p.id) })),
    });

  const tabMenu = (tab: Tab, x: number, y: number) =>
    app.showMenu({
      x,
      y,
      items: [
        { label: t("action.renameTab"), run: () => { app.selectTab(tab.id); void app.run("renameTab"); } },
        { label: t("action.duplicateTab"), run: () => app.duplicateTab(tab.id) },
        { label: t("tab.chooseIcon"), run: () => setTimeout(() => iconMenu(tab, x, y)) },
        { label: t("tab.chooseColor"), run: () => setTimeout(() => colorMenu(tab, x, y)) },
        "separator",
        { label: t("action.closeTab"), run: () => void app.closeTab(tab.id), danger: true },
      ],
    });

  const iconMenu = (tab: Tab, x: number, y: number) =>
    app.showMenu({ x, y, items: TAB_ICONS.map((name) => ({ label: `icon:${name}`, run: () => app.setTabLook(tab.id, { icon: name }) })) });

  const colorMenu = (tab: Tab, x: number, y: number) =>
    app.showMenu({ x, y, items: TAB_COLORS.map((c) => ({ label: `color:${c}`, run: () => app.setTabLook(tab.id, { color: c }) })) });

  return (
    <div className="tabbar" data-tauri-drag-region>
      <div className="tabs" role="tablist" data-tauri-drag-region>
        {s.tabs.map((tab, i) => {
          const active = tab.id === s.activeTab;
          const title = app.tabTitle(tab);
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              className={"tab" + (active ? " active" : "") + (over === i ? " drop" : "")}
              style={tab.color ? ({ "--tab-color": tab.color } as React.CSSProperties) : undefined}
              data-tab-index={i}
              onPointerDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  void app.closeTab(tab.id);
                  return;
                }
                if (e.button !== 0 || s.renaming === tab.id) return;
                app.selectTab(tab.id);
                drag.current = { from: i, x: e.clientX, moved: false };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (!d) return;
                if (!d.moved && Math.abs(e.clientX - d.x) < 6) return;
                d.moved = true;
                setOver(indexAt(e.clientX, e.clientY));
              }}
              onPointerUp={(e) => {
                const d = drag.current;
                drag.current = null;
                setOver(null);
                if (!d?.moved) return;
                const to = indexAt(e.clientX, e.clientY);
                if (to !== null) app.moveTab(d.from, to);
              }}
              onDoubleClick={() => { app.selectTab(tab.id); void app.run("renameTab"); }}
              onContextMenu={(e) => {
                e.preventDefault();
                tabMenu(tab, e.clientX, e.clientY);
              }}
              title={title}
            >
              {s.settings.showTabIcons && <Icon name={tab.icon} size={14} className="tab-icon" />}
              {s.renaming === tab.id ? (
                <input
                  className="tab-rename"
                  autoFocus
                  defaultValue={tab.title || title}
                  aria-label={t("action.renameTab")}
                  onFocus={(e) => e.currentTarget.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") app.renameTab(tab.id, e.currentTarget.value);
                    if (e.key === "Escape") app.renameTab(tab.id, tab.title);
                    e.stopPropagation();
                  }}
                  onBlur={(e) => app.renameTab(tab.id, e.currentTarget.value)}
                />
              ) : (
                <span className="tab-title">{title}</span>
              )}
              <button
                className="tab-close"
                aria-label={t("action.closeTab")}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => void app.closeTab(tab.id)}
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="tabbar-actions">
        <button className="icon-button" title={`${t("action.newTab")}  ${display(bindings.newTab, s.platform)}`} aria-label={t("action.newTab")} onClick={() => app.newTab()}>
          <Icon name="plus" />
        </button>
        <button
          className="icon-button narrow"
          title={t("tab.newWithProfile")}
          aria-label={t("tab.newWithProfile")}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            profileMenu(r.left, r.bottom + 4);
          }}
        >
          <Icon name="chevron-down" size={13} />
        </button>
        <div className="spacer" data-tauri-drag-region />
        <button className="icon-button" title={`${t("action.palette")}  ${display(bindings.palette, s.platform)}`} aria-label={t("action.palette")} onClick={() => app.openOverlay("palette")}>
          <Icon name="command" />
        </button>
        <button className="icon-button" title={`${t("common.settings")}  ${display(bindings.openSettings, s.platform)}`} aria-label={t("common.settings")} onClick={() => app.openOverlay("settings")}>
          <Icon name="settings" />
        </button>
      </div>
      {s.platform === "windows" && <CaptionButtons />}
    </div>
  );
}

/** Windows: the minimise, maximise and close buttons, in our bar instead of a system title bar. */
function CaptionButtons() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const w = getCurrentWindow();
    const update = () => void w.isMaximized().then(setMaximized).catch(() => {});
    update();
    const off = w.onResized(update);
    return () => void off.then((f) => f());
  }, []);
  const w = getCurrentWindow();
  return (
    <div className="caption-buttons">
      <button className="caption" aria-label={t("window.minimize")} title={t("window.minimize")} onClick={() => void w.minimize()}>
        <Icon name="minus" size={16} />
      </button>
      <button className="caption" aria-label={maximized ? t("window.restore") : t("window.maximize")} title={maximized ? t("window.restore") : t("window.maximize")} onClick={() => void w.toggleMaximize()}>
        <Icon name={maximized ? "copy" : "square"} size={13} />
      </button>
      <button className="caption close" aria-label={t("window.close")} title={t("window.close")} onClick={() => void w.close()}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
