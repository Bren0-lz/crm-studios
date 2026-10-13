import { useContext, useEffect } from "react";
import { SettingsPanelContext } from "./SettingsPanelContext";

export function useSettingsBusy(busy: boolean) {
  const register = useContext(SettingsPanelContext)?.registerBusy;
  useEffect(() => {
    if (busy && register) return register();
  }, [busy, register]);
}
