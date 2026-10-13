import { createContext } from "react";
import type { CloseGuard } from "./types";

export const SettingsPanelContext = createContext<{
  registerGuard: (guard: CloseGuard) => () => void;
  registerBusy: () => () => void;
} | null>(null);
