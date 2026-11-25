import { AdministrativeRegistrySection } from "./AdministrativeRegistrySection";
import { ClinicCatalogsContent } from "./ClinicCatalogsContent";
import {
  Fragment,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthorization } from "../../authorization-context";
import { type DataDomain, getDataVersion } from "../../shared/api/data-version";
import { PageHeader } from "../../shared/components/PageHeader";
import type { CloseGuard } from "../../shared/workflows/types";
import { AdminUsersContent } from "./AdminUsersContent";
import { AutoFinalizationContent } from "./AutoFinalizationContent";
import { PaymentMethodsContent } from "./PaymentMethodsContent";
import { BranchesContent } from "./BranchesContent";
import { ClinicSettingsContent } from "./ClinicSettingsContent";
import { HolidaysContent } from "./HolidaysContent";
import { IntegrationsContent } from "./IntegrationsContent";
import { NavTabLabelsContent } from "./NavTabLabelsContent";
import { settingsTabFromSection, settingsTabs } from "./model";
import { PatientTagsContent } from "./PatientTagsContent";
import { PlanTemplatesContent } from "./PlanTemplatesContent";
import { SettingsPanel } from "./SettingsPanel";
import type { SettingsTabKey } from "./types";

/** Domínios alterados pelas seções de Configurações (serviços, planos, feriados, etiquetas…). */
const settingsDomains: DataDomain[] = [
  "settings",
  "plans",
  "agenda",
  "patients",
  "finance",
];

export function SettingsPage() {
  const { user, canEdit } = useAuthorization();
  const admin = user?.role === "admin";
  const tabs = settingsTabs.filter((tab) => admin || !tab.adminOnly);
  const [searchParams] = useSearchParams();
  const [active, setActive] = useState<SettingsTabKey>(
    settingsTabFromSection(searchParams.get("secao")) ??
      (admin ? "clinic" : "plans"),
  );
  const [visited, setVisited] = useState<SettingsTabKey[]>([active]);
  // Seção já aberta volta remontada (e recarrega as listas) se algo mudou desde que ela foi
  // deixada — ex.: serviço criado em "Serviços e salas" aparece no plano sem F5 (RE11).
  const [mounts, setMounts] = useState<Partial<Record<SettingsTabKey, number>>>(
    {},
  );
  const leftAt = useRef(new Map<SettingsTabKey, number>());
  const [busyCount, setBusyCount] = useState(0);
  const guards = useRef(new Map<SettingsTabKey, CloseGuard>());
  const baseId = useId();
  const focusTarget = useRef<SettingsTabKey | null>(null);
  const selected = tabs.some((tab) => tab.key === active)
    ? active
    : tabs[0]!.key;
  useLayoutEffect(() => {
    if (busyCount === 0 && focusTarget.current) {
      document
        .getElementById(baseId + "-" + focusTarget.current + "-tab")
        ?.focus();
      focusTarget.current = null;
    }
  }, [selected, busyCount, baseId]);
  const registerGuard = useCallback(
    (key: SettingsTabKey, guard: CloseGuard) => {
      guards.current.set(key, guard);
      return () => {
        if (guards.current.get(key) === guard) guards.current.delete(key);
      };
    },
    [],
  );
  const registerBusy = useCallback(() => {
    setBusyCount((count) => count + 1);
    return () => setBusyCount((count) => count - 1);
  }, []);
  function select(key: SettingsTabKey) {
    if (key === selected || busyCount > 0) return;
    const proceed = () => {
      focusTarget.current = key;
      const version = getDataVersion(settingsDomains);
      leftAt.current.set(selected, version);
      const left = leftAt.current.get(key);
      if (left !== undefined && left !== version)
        setMounts((current) => ({
          ...current,
          [key]: (current[key] ?? 0) + 1,
        }));
      setActive(key);
      setVisited((current) =>
        current.includes(key) ? current : [...current, key],
      );
    };
    const guard = guards.current.get(selected);
    if (guard) guard(proceed);
    else proceed();
  }
  function moveFocus(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    document.getElementById(baseId + "-" + tabs[next]!.key + "-tab")?.focus();
  }
  return (
    <div className="settings-page">
      <PageHeader
        title="Configurações"
        description="Organize sua operação e personalize os detalhes da clínica."
      />
      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Seções de configurações"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            id={baseId + "-" + tab.key + "-tab"}
            type="button"
            role="tab"
            className="text-button settings-tab"
            aria-selected={selected === tab.key}
            aria-controls={baseId + "-" + tab.key + "-panel"}
            tabIndex={selected === tab.key ? 0 : -1}
            disabled={busyCount > 0}
            onClick={() => select(tab.key)}
            onKeyDown={(event) => moveFocus(event, index)}
          >
            <tab.icon size={18} aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <SettingsPanel
          key={tab.key}
          tab={tab}
          active={selected === tab.key}
          baseId={baseId}
          registerGuard={registerGuard}
          registerBusy={registerBusy}
        >
          {(visited.includes(tab.key) || selected === tab.key) && (
            <Fragment key={mounts[tab.key] ?? 0}>
              {tab.key === "clinic" ? (
                <ClinicSettingsContent />
              ) : tab.key === "branches" ? (
                <BranchesContent />
              ) : tab.key === "users" ? (
                <AdminUsersContent />
              ) : tab.key === "menu" ? (
                <NavTabLabelsContent />
              ) : tab.key === "autoFinalization" ? (
                <AutoFinalizationContent />
              ) : tab.key === "paymentMethods" ? (
                <PaymentMethodsContent />
              ) : tab.key === "integrations" ? (
                <IntegrationsContent busy={busyCount > 0} />
              ) : tab.key === "plans" ? (
                <PlanTemplatesContent />
              ) : tab.key === "holidays" ? (
                <HolidaysContent />
              ) : tab.key === "catalogs" ? (
                <ClinicCatalogsContent />
              ) : tab.key === "registry" ? (
                <AdministrativeRegistrySection />
              ) : (
                <PatientTagsContent canEdit={canEdit("settings")} />
              )}
            </Fragment>
          )}
        </SettingsPanel>
      ))}
    </div>
  );
}
