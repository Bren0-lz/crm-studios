import { createContext } from "react";
import type { NavigationGuard } from "./types";

export const NavigationGuardContext = createContext<
  (guard: NavigationGuard) => () => void
>(() => () => {});
