import { type ReactNode, useCallback } from "react";
import { SettingsPanelContext } from "../../shared/workflows/SettingsPanelContext";
import type { CloseGuard } from "../../shared/workflows/types";
import { settingsTabs } from "./model";
import type { SettingsTabKey } from "./types";

export function SettingsPanel({
  tab,
  active,
  baseId,
  registerGuard,
  registerBusy,
  children,
}: {
  tab: (typeof settingsTabs)[number];
  active: boolean;
  baseId: string;
  registerGuard: (key: SettingsTabKey, guard: CloseGuard) => () => void;
  registerBusy: () => () => void;
  children: ReactNode;
}) {
  const register = useCallback(
    (guard: CloseGuard) => registerGuard(tab.key, guard),
    [registerGuard, tab.key],
  );
  return (
    <SettingsPanelContext.Provider
      value={{ registerGuard: register, registerBusy }}
    >
      <section
        className={"panel settings-panel settings-" + tab.key}
        role="tabpanel"
        id={baseId + "-" + tab.key + "-panel"}
        aria-labelledby={baseId + "-" + tab.key + "-tab"}
        hidden={!active}
        tabIndex={0}
      >
        <div className="settings-panel-heading">
          <span className="settings-section-icon">
            <tab.icon size={22} aria-hidden="true" />
          </span>
          <div>
            <h2>{tab.title}</h2>
            <p>{tab.description}</p>
          </div>
        </div>
        <div className="settings-panel-content">{children}</div>
      </section>
    </SettingsPanelContext.Provider>
  );
}
