import { useRef, useState } from "react";
import { app, type Tab } from "../lib/app.ts";
import { useApp } from "../lib/useApp.ts";
import { t } from "../lib/i18n.ts";
import { display } from "../lib/keys.ts";
import { effectiveBindings } from "../lib/keys.ts";
import { TAB_COLORS, TAB_ICONS } from "../lib/settings.ts";
import { Icon } from "./Icon.tsx";

export function TabBar() {
  const s = useApp();
  const drag = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
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
              draggable={s.renaming !== tab.id}
              onDragStart={() => (drag.current = i)}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(i);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={() => {
                if (drag.current !== null) app.moveTab(drag.current, i);
                drag.current = null;
                setOver(null);
              }}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  void app.closeTab(tab.id);
                } else if (e.button === 0) app.selectTab(tab.id);
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
    </div>
  );
}
