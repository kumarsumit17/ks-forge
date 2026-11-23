import { useSyncExternalStore } from "react";
import { app, type State } from "./app.ts";

export function useApp(): State {
  return useSyncExternalStore(app.subscribe, app.getState);
}
