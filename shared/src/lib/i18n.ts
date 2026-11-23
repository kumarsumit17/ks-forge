// Interface text in English and Hindi (ks-utility specs/languages.md): every string is a key
// of src/locales/*.json or of ks-utility's shared catalogue, looked up with ks-utility's
// translator. The language follows the system unless the settings chose one.

import { createTranslator, resolveLanguage, type Language, type Params } from "ks-utility";
import commonEn from "ks-utility/lang/common/en.json";
import commonHi from "ks-utility/lang/common/hi.json";
import appEn from "../locales/en.json";
import appHi from "../locales/hi.json";

export type TextKey = keyof typeof appEn | keyof typeof commonEn;

/** A message from Rust: a key and its parameters (src-tauri/src/msg.rs). */
export interface Msg {
  code: string;
  params: Record<string, string>;
}

const layers = [
  { en: commonEn, hi: commonHi },
  { en: appEn, hi: appHi },
];

let language: Language = resolveLanguage(null, navigator.languages);
let translate = createTranslator(language, ...layers);

export function setLanguage(choice: unknown): Language {
  language = resolveLanguage(choice, navigator.languages);
  translate = createTranslator(language, ...layers);
  document.documentElement.lang = language;
  return language;
}

export function currentLanguage(): Language {
  return language;
}

export function t(key: TextKey, params?: Params): string {
  return translate(key, params);
}

/** For keys built at run time ("action." + id). */
export function tk(key: string, params?: Params): string {
  return translate(key, params);
}

export function isMsg(v: unknown): v is Msg {
  return typeof v === "object" && v !== null && typeof (v as Msg).code === "string";
}

/** An error from Rust or JavaScript, in the interface language. */
export function errorText(e: unknown): string {
  if (isMsg(e)) return translate(e.code, e.params);
  return e instanceof Error ? e.message : String(e);
}
