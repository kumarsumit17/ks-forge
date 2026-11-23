import { useEffect, useMemo, useRef, useState } from "react";
import { app } from "../lib/app.ts";
import { useApp } from "../lib/useApp.ts";
import { t, tk, type TextKey } from "../lib/i18n.ts";
import { ACTIONS, conflicts, display, effectiveBindings, fromEvent, normalize, defaultBindings, type ActionId } from "../lib/keys.ts";
import { FONT_WEIGHTS, LIMITS, TAB_ICONS, defaultFont, type CursorStyle, type Profile, type Settings as S } from "../lib/settings.ts";
import { parseTheme, type Theme } from "../lib/themes.ts";
import { joinArgs, splitArgs } from "../lib/text.ts";
import { api } from "../lib/tauri.ts";
import { formatBytes } from "ks-utility";
import { Icon } from "./Icon.tsx";
import { useUpdates } from "./Overlays.tsx";

const SECTIONS: { id: string; icon: string; label: TextKey }[] = [
  { id: "general", icon: "settings", label: "settings.general" },
  { id: "appearance", icon: "palette", label: "settings.appearance" },
  { id: "profiles", icon: "user", label: "settings.profiles" },
  { id: "keyboard", icon: "keyboard", label: "settings.keyboard" },
  { id: "updates", icon: "refresh-cw", label: "common.appUpdate.section" },
  { id: "about", icon: "info", label: "settings.about" },
];

export function SettingsView() {
  const s = useApp();
  return (
    <div className="scrim" onMouseDown={() => app.closeOverlay()}>
      <div
        className="settings"
        role="dialog"
        aria-modal="true"
        aria-label={t("common.settings")}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !(e.target as HTMLElement).closest(".recording")) app.closeOverlay();
        }}
      >
        <nav className="settings-nav" aria-label={t("common.settings")}>
          <h2>{t("common.settings")}</h2>
          {SECTIONS.map((x) => (
            <button key={x.id} className={"nav-item" + (s.settingsSection === x.id ? " active" : "")} onClick={() => app.setSettingsSection(x.id)}>
              <Icon name={x.icon} size={15} />
              <span>{t(x.label)}</span>
            </button>
          ))}
          <div className="spacer" />
          <button className="nav-item" onClick={() => void app.run("openSettingsFile")}>
            <Icon name="file-text" size={15} />
            <span>{t("action.openSettingsFile")}</span>
          </button>
        </nav>
        <div className="settings-body">
          <button className="icon-button settings-close" aria-label={t("common.close")} onClick={() => app.closeOverlay()}>
            <Icon name="x" />
          </button>
          {s.settingsSection === "general" && <General />}
          {s.settingsSection === "appearance" && <Appearance />}
          {s.settingsSection === "profiles" && <Profiles />}
          {s.settingsSection === "keyboard" && <KeyboardSection />}
          {s.settingsSection === "updates" && <Updates />}
          {s.settingsSection === "about" && <About />}
        </div>
      </div>
    </div>
  );
}

const set = (patch: Partial<S>) => app.updateSettings(patch);

function Row({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="row">
      <div className="row-text">
        <label htmlFor={htmlFor}>{label}</label>
        {hint && <p className="hint">{hint}</p>}
      </div>
      <div className="row-control">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={checked} aria-label={label} className={"switch" + (checked ? " on" : "")} onClick={() => onChange(!checked)} />;
}

function NumberField({ value, min, max, step = 1, onChange, label, id }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; id?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      id={id}
      className="number"
      type="number"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

function General() {
  const { settings: s, platform, info } = useApp();
  return (
    <section>
      <h3>{t("settings.general")}</h3>
      <Row label={t("common.language")} htmlFor="language">
        <select id="language" value={s.language} onChange={(e) => set({ language: e.target.value as S["language"] })}>
          <option value="system">{t("common.language.system")}</option>
          <option value="en">{t("common.language.english")}</option>
          <option value="hi">{t("common.language.hindi")}</option>
        </select>
      </Row>
      <Row label={t("settings.defaultProfile")} htmlFor="default-profile">
        <select id="default-profile" value={s.defaultProfile} onChange={(e) => set({ defaultProfile: e.target.value })}>
          {s.profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Row>
      <Row label={t("settings.newTabsInCurrentFolder")} hint={t("settings.newTabsInCurrentFolderHint")}>
        <Switch label={t("settings.newTabsInCurrentFolder")} checked={s.newTabsInCurrentFolder} onChange={(v) => set({ newTabsInCurrentFolder: v })} />
      </Row>
      <Row label={t("settings.confirmClose")} hint={platform === "macos" ? t("settings.confirmCloseHint") : t("settings.confirmCloseHintWindows")}>
        <Switch label={t("settings.confirmClose")} checked={s.confirmClose} onChange={(v) => set({ confirmClose: v })} />
      </Row>
      <Row label={t("settings.confirmPaste")} hint={t("settings.confirmPasteHint")}>
        <Switch label={t("settings.confirmPaste")} checked={s.confirmPaste} onChange={(v) => set({ confirmPaste: v })} />
      </Row>
      <Row label={t("settings.copyOnSelect")}>
        <Switch label={t("settings.copyOnSelect")} checked={s.copyOnSelect} onChange={(v) => set({ copyOnSelect: v })} />
      </Row>
      <Row label={t("settings.rightClickPaste")} hint={t("settings.rightClickPasteHint")}>
        <Switch label={t("settings.rightClickPaste")} checked={s.rightClickPaste} onChange={(v) => set({ rightClickPaste: v })} />
      </Row>
      {platform === "macos" && (
        <Row label={t("settings.optionIsMeta")} hint={t("settings.optionIsMetaHint")}>
          <Switch label={t("settings.optionIsMeta")} checked={s.optionIsMeta} onChange={(v) => set({ optionIsMeta: v })} />
        </Row>
      )}
      <Row label={t("settings.scrollback")} hint={t("settings.scrollbackHint")} htmlFor="scrollback">
        <NumberField id="scrollback" label={t("settings.scrollback")} value={s.scrollback} min={LIMITS.scrollback[0]} max={LIMITS.scrollback[1]} step={1000} onChange={(v) => set({ scrollback: Math.round(v) })} />
      </Row>
      <Row label={t("settings.file")} hint={info?.settingsPath}>
        <button className="button" onClick={() => void app.run("openSettingsFile")}>{t("action.openSettingsFile")}</button>
      </Row>
    </section>
  );
}

/** Monospace fonts we suggest, kept only when installed. */
const FONT_CANDIDATES = [
  "ui-monospace", "Menlo", "Monaco", "SF Mono", "JetBrains Mono", "Fira Code", "Cascadia Code", "Cascadia Mono", "Consolas",
  "Source Code Pro", "IBM Plex Mono", "Hack", "Iosevka", "Victor Mono", "Ubuntu Mono", "Roboto Mono", "Courier New",
  "Hasklig", "Inconsolata", "DejaVu Sans Mono", "Lucida Console", "Geist Mono", "Commit Mono", "Monaspace Neon",
];

function installedFonts(): string[] {
  const c = document.createElement("canvas").getContext("2d");
  if (!c) return FONT_CANDIDATES;
  const sample = "mmmmmmmmmmlli1WW@#";
  const width = (font: string) => {
    c.font = `40px ${font}`;
    return c.measureText(sample).width;
  };
  const bases = ["monospace", "serif", "sans-serif"].map((b) => [b, width(b)] as const);
  return FONT_CANDIDATES.filter((f) => f === "ui-monospace" || bases.some(([b, w]) => width(`"${f}", ${b}`) !== w));
}

function ThemeCard({ theme, selected, onPick }: { theme: Theme; selected: boolean; onPick: () => void }) {
  const colors = [theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan];
  return (
    <button className={"theme-card" + (selected ? " selected" : "")} style={{ background: theme.background, color: theme.foreground }} onClick={onPick} aria-pressed={selected}>
      <span className="theme-sample">
        <span style={{ color: theme.accent }}>❯</span> ls <span style={{ color: theme.blue }}>src</span>
      </span>
      <span className="theme-dots">
        {colors.map((c, i) => (
          <i key={i} style={{ background: c }} />
        ))}
      </span>
      <span className="theme-name">{theme.name}</span>
    </button>
  );
}

function Appearance() {
  const { settings: s, platform, systemDark } = useApp();
  const fonts = useMemo(installedFonts, []);
  const themes = app.allThemes();
  const file = useRef<HTMLInputElement>(null);
  const pickTarget = s.followSystem ? (systemDark ? "darkTheme" : "lightTheme") : "theme";
  const current = s.followSystem ? (systemDark ? s.darkTheme : s.lightTheme) : s.theme;

  const importTheme = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text());
      const list = Array.isArray(raw) ? raw : [raw];
      const parsed = list.map(parseTheme);
      if (parsed.some((x) => !x)) throw new Error(t("theme.importBad"));
      const custom = [...s.customThemes.filter((c) => !parsed.some((p) => p!.id === c.id)), ...(parsed as Theme[])];
      set({ customThemes: custom });
      app.showToast(t("theme.imported", { count: parsed.length }));
    } catch (e) {
      app.showToast(e instanceof SyntaxError ? t("theme.importBad") : String((e as Error).message));
    }
  };

  return (
    <section>
      <h3>{t("settings.appearance")}</h3>
      <Row label={t("settings.followSystem")} hint={t("settings.followSystemHint")}>
        <Switch label={t("settings.followSystem")} checked={s.followSystem} onChange={(v) => set({ followSystem: v, theme: current })} />
      </Row>
      {s.followSystem && (
        <>
          <Row label={t("settings.lightTheme")} htmlFor="light-theme">
            <select id="light-theme" value={s.lightTheme} onChange={(e) => set({ lightTheme: e.target.value })}>
              {themes.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
            </select>
          </Row>
          <Row label={t("settings.darkTheme")} htmlFor="dark-theme">
            <select id="dark-theme" value={s.darkTheme} onChange={(e) => set({ darkTheme: e.target.value })}>
              {themes.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
            </select>
          </Row>
        </>
      )}
      <p className="hint">{s.followSystem ? t(systemDark ? "settings.pickDark" : "settings.pickLight") : t("settings.pickTheme")}</p>
      <div className="theme-grid">
        {themes.map((th) => (
          <ThemeCard key={th.id} theme={th} selected={th.id === current} onPick={() => set({ [pickTarget]: th.id } as Partial<S>)} />
        ))}
      </div>
      <div className="button-row">
        <button className="button" onClick={() => file.current?.click()}>
          <Icon name="upload" size={14} /> {t("theme.import")}
        </button>
        <button
          className="button"
          onClick={() => {
            void api.clipboardWrite(JSON.stringify(app.theme, null, 2));
            app.showToast(t("theme.copied"));
          }}
        >
          <Icon name="copy" size={14} /> {t("theme.export")}
        </button>
        {s.customThemes.some((c) => c.id === current) && (
          <button className="button danger" onClick={() => set({ customThemes: s.customThemes.filter((c) => c.id !== current) })}>
            <Icon name="trash-2" size={14} /> {t("theme.remove")}
          </button>
        )}
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && void importTheme(e.target.files[0])} />
      </div>
      <Row label={t("settings.accent")} hint={t("settings.accentHint")}>
        <input type="color" aria-label={t("settings.accent")} value={s.accent || app.theme.accent} onChange={(e) => set({ accent: e.target.value })} />
        {s.accent && <button className="link" onClick={() => set({ accent: "" })}>{t("settings.reset")}</button>}
      </Row>

      <h3>{t("settings.text")}</h3>
      <Row label={t("settings.font")} hint={t("settings.fontHint")} htmlFor="font">
        <input id="font" className="text" list="fonts" defaultValue={s.fontFamily} onBlur={(e) => e.target.value.trim() && set({ fontFamily: e.target.value.trim() })} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        <datalist id="fonts">
          {fonts.map((f) => <option key={f} value={f} />)}
        </datalist>
        {s.fontFamily !== defaultFont(platform) && <button className="link" onClick={() => set({ fontFamily: defaultFont(platform) })}>{t("settings.reset")}</button>}
      </Row>
      <Row label={t("settings.fontSize")} htmlFor="font-size">
        <NumberField id="font-size" label={t("settings.fontSize")} value={s.fontSize} min={LIMITS.fontSize[0]} max={LIMITS.fontSize[1]} onChange={(v) => set({ fontSize: v })} />
      </Row>
      <Row label={t("settings.lineHeight")} htmlFor="line-height">
        <NumberField id="line-height" label={t("settings.lineHeight")} value={s.lineHeight} min={LIMITS.lineHeight[0]} max={LIMITS.lineHeight[1]} step={0.05} onChange={(v) => set({ lineHeight: Math.round(v * 100) / 100 })} />
      </Row>
      <Row label={t("settings.fontWeight")} htmlFor="font-weight">
        <select id="font-weight" value={s.fontWeight} onChange={(e) => set({ fontWeight: e.target.value })}>
          {FONT_WEIGHTS.map((w) => <option key={w} value={w}>{w === "normal" ? t("settings.weightNormal") : w === "bold" ? t("settings.weightBold") : w}</option>)}
        </select>
      </Row>
      <Row label={t("settings.ligatures")} hint={t("settings.ligaturesHint")}>
        <Switch label={t("settings.ligatures")} checked={s.ligatures} onChange={(v) => set({ ligatures: v })} />
      </Row>
      <Row label={t("settings.cursor")}>
        <div className="segmented" role="radiogroup" aria-label={t("settings.cursor")}>
          {(["block", "bar", "underline"] as CursorStyle[]).map((c) => (
            <button key={c} role="radio" aria-checked={s.cursorStyle === c} className={s.cursorStyle === c ? "on" : ""} onClick={() => set({ cursorStyle: c })}>
              {tk(`settings.cursor.${c}`)}
            </button>
          ))}
        </div>
      </Row>
      <Row label={t("settings.cursorBlink")}>
        <Switch label={t("settings.cursorBlink")} checked={s.cursorBlink} onChange={(v) => set({ cursorBlink: v })} />
      </Row>
      <Row label={t("settings.padding")} htmlFor="padding">
        <NumberField id="padding" label={t("settings.padding")} value={s.padding} min={LIMITS.padding[0]} max={LIMITS.padding[1]} onChange={(v) => set({ padding: Math.round(v) })} />
      </Row>
      <Row label={t("settings.showTabIcons")}>
        <Switch label={t("settings.showTabIcons")} checked={s.showTabIcons} onChange={(v) => set({ showTabIcons: v })} />
      </Row>
    </section>
  );
}

function Profiles() {
  const { settings: s, found } = useApp();
  const [selected, setSelected] = useState(s.defaultProfile || s.profiles[0]?.id || "");
  const p = s.profiles.find((x) => x.id === selected) ?? s.profiles[0];
  const themes = app.allThemes();
  const change = (patch: Partial<Profile>) => p && set({ profiles: s.profiles.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) });
  const add = (base?: Profile) => {
    let n = 1;
    while (s.profiles.some((x) => x.id === `profile-${n}`)) n++;
    const id = `profile-${n}`;
    const fresh: Profile = base
      ? { ...base, id, name: t("profile.copyName", { name: base.name }) }
      : { id, name: t("profile.newName", { n }), program: s.profiles[0]?.program ?? "", args: [], cwd: "", env: {}, icon: "terminal", theme: "", shellIntegration: true };
    set({ profiles: [...s.profiles, fresh] });
    setSelected(id);
  };
  const remove = async () => {
    if (!p || s.profiles.length < 2) return;
    const ok = await app.confirm({ title: t("common.confirm.removeTitle", { name: p.name }), body: t("profile.removeBody"), ok: t("common.remove"), danger: true });
    if (!ok) return;
    const hidden = found.some((f) => f.id === p.id) ? [...new Set([...s.hiddenProfiles, p.id])] : s.hiddenProfiles;
    set({ profiles: s.profiles.filter((x) => x.id !== p.id), hiddenProfiles: hidden });
    setSelected(s.profiles.find((x) => x.id !== p.id)?.id ?? "");
  };
  const restore = () => set({ hiddenProfiles: [] });

  return (
    <section className="profiles">
      <h3>{t("settings.profiles")}</h3>
      <p className="hint">{t("profile.intro")}</p>
      <div className="profiles-layout">
        <div className="profile-list" role="listbox" aria-label={t("settings.profiles")}>
          {s.profiles.map((x) => (
            <button key={x.id} role="option" aria-selected={x.id === p?.id} className={"profile-item" + (x.id === p?.id ? " active" : "")} onClick={() => setSelected(x.id)}>
              <Icon name={x.icon} size={14} />
              <span>{x.name}</span>
              {x.id === s.defaultProfile && <span className="badge">{t("profile.default")}</span>}
            </button>
          ))}
          <button className="button" onClick={() => add()}>
            <Icon name="plus" size={14} /> {t("profile.add")}
          </button>
          {s.hiddenProfiles.length > 0 && <button className="link" onClick={restore}>{t("profile.restoreFound")}</button>}
        </div>
        {p && (
          <div className="profile-editor" key={p.id}>
            <Row label={t("profile.name")} htmlFor="p-name">
              <input id="p-name" className="text" defaultValue={p.name} onBlur={(e) => e.target.value.trim() && change({ name: e.target.value.trim() })} />
            </Row>
            <Row label={t("profile.program")} hint={t("profile.programHint")} htmlFor="p-program">
              <input id="p-program" className="text mono" defaultValue={p.program} spellCheck={false} onBlur={(e) => e.target.value.trim() && change({ program: e.target.value.trim() })} />
            </Row>
            <Row label={t("profile.args")} hint={t("profile.argsHint")} htmlFor="p-args">
              <input id="p-args" className="text mono" defaultValue={joinArgs(p.args)} spellCheck={false} onBlur={(e) => change({ args: splitArgs(e.target.value) })} />
            </Row>
            <Row label={t("profile.cwd")} hint={t("profile.cwdHint")} htmlFor="p-cwd">
              <input id="p-cwd" className="text mono" defaultValue={p.cwd} spellCheck={false} onBlur={(e) => change({ cwd: e.target.value.trim() })} />
            </Row>
            <Row label={t("profile.env")} hint={t("profile.envHint")} htmlFor="p-env">
              <textarea
                id="p-env"
                className="text mono"
                rows={3}
                spellCheck={false}
                defaultValue={Object.entries(p.env).map(([k, v]) => `${k}=${v}`).join("\n")}
                onBlur={(e) => {
                  const env: Record<string, string> = {};
                  for (const line of e.target.value.split("\n")) {
                    const i = line.indexOf("=");
                    const k = line.slice(0, i).trim();
                    if (i > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) env[k] = line.slice(i + 1);
                  }
                  change({ env });
                }}
              />
            </Row>
            <Row label={t("profile.icon")}>
              <div className="icon-grid" role="radiogroup" aria-label={t("profile.icon")}>
                {TAB_ICONS.map((name) => (
                  <button key={name} role="radio" aria-checked={p.icon === name} aria-label={name} className={p.icon === name ? "on" : ""} onClick={() => change({ icon: name })}>
                    <Icon name={name} size={15} />
                  </button>
                ))}
              </div>
            </Row>
            <Row label={t("profile.theme")} htmlFor="p-theme">
              <select id="p-theme" value={p.theme} onChange={(e) => change({ theme: e.target.value })}>
                <option value="">{t("profile.sameTheme")}</option>
                {themes.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
              </select>
            </Row>
            <Row label={t("profile.shellIntegration")} hint={t("profile.shellIntegrationHint")}>
              <Switch label={t("profile.shellIntegration")} checked={p.shellIntegration} onChange={(v) => change({ shellIntegration: v })} />
            </Row>
            <div className="button-row">
              <button className="button" disabled={p.id === s.defaultProfile} onClick={() => set({ defaultProfile: p.id })}>{t("profile.makeDefault")}</button>
              <button className="button" onClick={() => add(p)}>{t("profile.duplicate")}</button>
              <button className="button" onClick={() => { app.closeOverlay(); app.newTab(p.id); }}>{t("profile.open")}</button>
              <button className="button danger" disabled={s.profiles.length < 2} onClick={() => void remove()}>{t("common.remove")}</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function KeyboardSection() {
  const { settings: s, platform } = useApp();
  const [filter, setFilter] = useState("");
  const [recording, setRecording] = useState<ActionId | null>(null);
  const effective = effectiveBindings(s.keybindings, platform);
  const clash = conflicts(s.keybindings, platform);
  const defaults = defaultBindings(platform);
  const setBinding = (a: ActionId, b: string | null) => {
    const kb = { ...s.keybindings };
    if (b === null || b === (defaults[a] ?? "")) delete kb[a];
    else kb[a] = b;
    set({ keybindings: kb });
  };

  return (
    <section>
      <h3>{t("settings.keyboard")}</h3>
      <p className="hint">{t("keys.intro")}</p>
      <input className="text filter" placeholder={t("keys.filter")} aria-label={t("keys.filter")} value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="keys-table" role="table">
        {ACTIONS.filter((a) => !filter || tk(`action.${a}`).toLowerCase().includes(filter.toLowerCase()) || display(effective[a], platform).toLowerCase().includes(filter.toLowerCase())).map((a) => (
          <div key={a} className={"keys-row" + (clash.has(a) ? " clash" : "")} role="row">
            <span role="cell">{tk(`action.${a}`)}</span>
            <span role="cell" className="keys-cell">
              {recording === a ? (
                <button
                  className="key-button recording"
                  autoFocus
                  onBlur={() => setRecording(null)}
                  onKeyDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.key === "Escape") return setRecording(null);
                    const combo = fromEvent(e.nativeEvent);
                    if (!combo || ["shift", "ctrl", "alt", "cmd"].includes(combo.split("+").pop()!)) return;
                    setBinding(a, normalize(combo, platform) ?? combo);
                    setRecording(null);
                  }}
                >
                  {t("keys.press")}
                </button>
              ) : (
                <button className="key-button" onClick={() => setRecording(a)} aria-label={t("keys.change", { action: tk(`action.${a}`) })}>
                  {effective[a] ? <kbd>{display(effective[a], platform)}</kbd> : <span className="muted">{t("keys.none")}</span>}
                </button>
              )}
              {clash.has(a) && <span className="clash-note" title={t("keys.clash")}><Icon name="triangle-alert" size={13} /></span>}
              {a in s.keybindings && <button className="link" onClick={() => setBinding(a, null)}>{t("settings.reset")}</button>}
              {effective[a] && <button className="link" onClick={() => setBinding(a, "")} aria-label={t("keys.remove")}>{t("common.remove")}</button>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Updates() {
  const { settings: s, info } = useApp();
  const u = useUpdates();
  const dev = !info || info.version === "0.0.0";
  return (
    <section>
      <h3>{t("common.appUpdate.section")}</h3>
      <p>{dev ? t("common.appUpdate.dev") : t("common.appUpdate.current", { version: info!.version })}</p>
      <Row label={t("common.appUpdate.auto")} hint={t("common.appUpdate.autoHint")}>
        <Switch label={t("common.appUpdate.auto")} checked={s.autoUpdate} onChange={(v) => set({ autoUpdate: v })} />
      </Row>
      <div className="button-row">
        <button className="button" disabled={u.phase === "checking" || u.phase === "downloading"} onClick={() => void app.updates.checkNow()}>
          {t("common.appUpdate.checkButton")}
        </button>
        {u.note && <span className="status" aria-live="polite">{tk(u.note.key, u.note.params)}</span>}
      </div>
      {u.available && u.available.size !== undefined && u.phase !== "opened" && (
        <div className="button-row">
          <button
            className="button primary"
            disabled={u.phase === "downloading"}
            onClick={async () => {
              const opened = await app.updates.installNow();
              if (opened === "windows") setTimeout(() => void app.quit(), 1500);
            }}
          >
            {t("common.appUpdate.installButton", { size: formatBytes(u.available.size) })}
          </button>
        </div>
      )}
    </section>
  );
}

function About() {
  const { info } = useApp();
  return (
    <section className="about">
      <h3>{t("settings.about")}</h3>
      <div className="about-head">
        <img src="/icon.png" alt="" width={56} height={56} />
        <div>
          <strong>KS Forge</strong>
          <p className="muted">{info && info.version !== "0.0.0" ? t("about.version", { version: info.version }) : t("common.appUpdate.dev")}</p>
        </div>
      </div>
      <p>{t("about.tagline")}</p>
      <p>{t("about.privacy")}</p>
      <p className="muted">{t("about.licence")}</p>
      <div className="button-row">
        <button className="button" onClick={() => info && void api.openUrl(`https://github.com/${info.repo}`)}>{t("about.source")}</button>
        <button className="button" onClick={() => info && void api.openUrl(`https://github.com/${info.repo}/blob/main/docs/THIRD_PARTY.md`)}>{t("about.notices")}</button>
      </div>
    </section>
  );
}
