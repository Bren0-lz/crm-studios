import type { AssessmentTemplateInput, PatientOption } from "@crm/contracts";
import {
  ArrowLeft,
  ClipboardList,
  FilePen,
  FileText,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import {
  AssessmentTemplateLibrary,
  AssessmentTemplateStudio,
  type ConfirmLeave,
} from "./AssessmentTemplatesTabs";
import { ClinicalChart } from "./ClinicalChart";
import { ClinicalPatientList } from "./ClinicalPatientList";

type RecordsTab = "prontuarios" | "modelos" | "criar-modelo";

/**
 * Prontuários por cliente: à esquerda a lista com busca, à direita o prontuário
 * do cliente escolhido (`?cliente=<id>`, que também serve de link direto). As abas Modelos e
 * Criar modelo gerenciam os formulários de avaliação (`?aba=modelos` abre direto na lista).
 */
export function ClinicalRecordsPage() {
  const { can, canEdit } = useAuthorization();
  const [searchParams, setSearchParams] = useSearchParams();
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canManage = canEdit("clinical");
  const selectedId = searchParams.get("cliente") ?? undefined;
  const canCreateTemplate = canManage && can("clinical.templates_create");
  const [activeTab, setActiveTab] = useState<RecordsTab>(() =>
    !selectedId && searchParams.get("aba") === "modelos"
      ? "modelos"
      : "prontuarios",
  );
  // Modelo de partida da aba Criar modelo; a chave remonta o editor a cada novo começo.
  const [studio, setStudio] = useState<{
    key: number;
    initial?: AssessmentTemplateInput;
  }>({ key: 0 });
  const leaveGuard = useRef<ConfirmLeave | null>(null);
  const registerLeaveGuard = useCallback((guard: ConfirmLeave | null) => {
    leaveGuard.current = guard;
  }, []);
  const tabsId = useId();
  const tabs: Array<{ key: RecordsTab; label: string; icon: LucideIcon }> = [
    { key: "prontuarios", label: "Prontuários", icon: FileText },
    { key: "modelos", label: "Modelos de avaliação", icon: ClipboardList },
    ...(canCreateTemplate
      ? [{ key: "criar-modelo" as const, label: "Criar modelo", icon: FilePen }]
      : []),
  ];

  function openTab(key: RecordsTab) {
    const proceed = () => setActiveTab(key);
    if (activeTab === "criar-modelo" && leaveGuard.current)
      leaveGuard.current(proceed);
    else proceed();
  }

  function moveTabFocus(
    event: KeyboardEvent<HTMLButtonElement>,
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
    openTab(tabs[next]!.key);
    document.getElementById(`${tabsId}-${tabs[next]!.key}-tab`)?.focus();
  }

  useEffect(() => {
    let active = true;
    api
      .patientOptions()
      .then((patientData) => {
        if (active) setPatients(patientData);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function select(patientId: string | undefined) {
    setSearchParams(patientId ? { cliente: patientId } : {});
  }

  const selected = patients.find((patient) => patient.id === selectedId);

  return (
    <>
      <PageHeader
        title="Prontuários"
        description="Avaliações, metas e arquivos de cada cliente, num só lugar."
      />
      {!canManage && <ReadOnlyNotice module="clinical" />}
      {error && <ErrorBanner error={error} />}
      <div
        className="settings-tabs clinical-records-tabs"
        role="tablist"
        aria-label="Seções de prontuários"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            id={`${tabsId}-${tab.key}-tab`}
            type="button"
            role="tab"
            className="text-button settings-tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`${tabsId}-${tab.key}-panel`}
            tabIndex={activeTab === tab.key ? 0 : -1}
            onClick={() => openTab(tab.key)}
            onKeyDown={(event) => moveTabFocus(event, index)}
          >
            <tab.icon size={18} aria-hidden="true" />
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "modelos" && (
        <div
          id={`${tabsId}-modelos-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-modelos-tab`}
        >
          <AssessmentTemplateLibrary
            onCreate={() => {
              setStudio((current) => ({ key: current.key + 1 }));
              setActiveTab("criar-modelo");
            }}
            onDuplicate={(initial) => {
              setStudio((current) => ({ key: current.key + 1, initial }));
              setActiveTab("criar-modelo");
            }}
          />
        </div>
      )}
      {activeTab === "criar-modelo" && canCreateTemplate && (
        <div
          id={`${tabsId}-criar-modelo-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-criar-modelo-tab`}
        >
          <AssessmentTemplateStudio
            key={studio.key}
            initial={studio.initial}
            onLeaveGuard={registerLeaveGuard}
            onCreated={() => {
              setStudio((current) => ({ key: current.key + 1 }));
              setActiveTab("modelos");
            }}
          />
        </div>
      )}
      {activeTab !== "prontuarios" ? null : loading ? (
        <LoadingBlock />
      ) : (
        <div
          id={`${tabsId}-prontuarios-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsId}-prontuarios-tab`}
          className={`clinical-records-layout${selected ? " has-selection" : ""}`}
        >
          <div className="clinical-records-aside">
            <ClinicalPatientList
              patients={patients}
              selectedId={selected?.id}
              onSelect={select}
            />
          </div>
          <section
            className="panel clinical-chart-shell"
            aria-label="Prontuário do cliente"
          >
            {selected ? (
              <>
                <button
                  type="button"
                  className="text-button clinical-back"
                  onClick={() => select(undefined)}
                >
                  <ArrowLeft size={16} /> Clientes
                </button>
                <ClinicalChart
                  key={selected.id}
                  patientId={selected.id}
                  editable={canManage}
                />
              </>
            ) : (
              <EmptyState
                icon={Stethoscope}
                title="Escolha um cliente"
                copy="Selecione um cliente na lista para abrir o prontuário completo."
              />
            )}
          </section>
        </div>
      )}
    </>
  );
}
