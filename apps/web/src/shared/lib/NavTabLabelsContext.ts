import type { NavTabLabel } from "@crm/contracts";
import { createContext } from "react";

/** Avisa o menu lateral dos nomes de abas recém-salvos nas configurações. */
export const NavTabLabelsContext = createContext<
  (labels: NavTabLabel[]) => void
>(() => undefined);
