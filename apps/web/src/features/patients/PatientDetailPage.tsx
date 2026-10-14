import { InventoryPanel } from "./InventoryPanel";
import {
  type Patient,
  patientProfileLabels,
  patientProfileValueLabels,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { PageHeader } from "../../shared/components/PageHeader";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { usePatientTags } from "../../shared/hooks/usePatientTags";
import { ClinicalWorkspacePanel } from "../clinical/index";
import { PatientModal } from "./PatientModal";
import { PatientTimelineSection } from "./PatientTimelineSection";

export function PatientDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can, canView, canEdit } = useAuthorization();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [clinical, setClinical] = useState(false);
  const [busy, setBusy] = useState(false);
  const tags = usePatientTags();
  useEffect(() => {
    let alive = true;
    api
      .patient(id)
      .then((data) => {
        if (alive) {
          setPatient(data);
          if (data.id !== id)
            navigate(`/clientes/${data.id}`, { replace: true });
        }
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [id, navigate]);
  async function changeStatus() {
    if (!patient) return;
    setBusy(true);
    setError("");
    try {
      setPatient(
        await api.setPatientStatus(
          id,
          patient.status === "active" ? "inactive" : "active",
        ),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const links = [
    { module: "agenda", to: "/agenda", label: "Agenda" },
    { module: "groups", to: "/turmas", label: "Turmas" },
    { module: "plans", to: "/planos", label: "Planos e sessões" },
    { module: "contracts", to: "/contratos", label: "Contratos" },
    { module: "finance", to: "/financeiro", label: "Financeiro" },
    { module: "relationship", to: "/relacionamento", label: "Relacionamento" },
    { module: "communications", to: "/comunicacoes", label: "Comunicações" },
  ] as const;
  return (
    <>
      <PageHeader
        eyebrow="Cliente"
        title={patient?.fullName ?? "Detalhes do cliente"}
        description={
          patient
            ? `${patient.recordNumber} · ${patient.status === "active" ? "Ativo" : "Inativo"}`
            : "Cadastro e acompanhamento"
        }
        action={
          <Link className="secondary-button" to="/clientes">
            Voltar aos clientes
          </Link>
        }
      />
      {error && <ErrorBanner error={error} />}
      {!patient && !error && <LoadingBlock />}
      {patient && (
        <>
          <section className="panel">
            <div className="panel-head">
              <h2>Cadastro e acompanhamento</h2>
              <div className="page-actions">
                {can("patients.update") && (
                  <>
                    <button
                      className="secondary-button"
                      onClick={() => setEditing(true)}
                    >
                      Editar cadastro
                    </button>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void changeStatus()}
                    >
                      {patient.status === "active"
                        ? "Inativar cliente"
                        : "Reativar cliente"}
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="patient-detail-body">
              <div className="page-actions">
                {links
                  .filter((item) => canView(item.module))
                  .map((item) => (
                    <Link
                      className="secondary-button"
                      key={item.module}
                      to={`${item.to}?patientId=${encodeURIComponent(id)}`}
                    >
                      {item.label}
                    </Link>
                  ))}
                {canView("clinical") && (
                  <button
                    className="secondary-button"
                    onClick={() => setClinical((value) => !value)}
                  >
                    Prontuário e avaliações
                  </button>
                )}
              </div>
              <dl className="patient-detail-fields">
                <div>
                  <dt>Telefone</dt>
                  <dd>{patient.phone}</dd>
                </div>
                {Object.entries(patientProfileLabels).map(([key, label]) => {
                  const value =
                    patient[key as keyof typeof patientProfileLabels];
                  if (
                    value === undefined ||
                    value === "" ||
                    (Array.isArray(value) && !value.length)
                  )
                    return null;
                  return (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>
                        {Array.isArray(value)
                          ? value.join(", ")
                          : typeof value === "boolean"
                            ? value
                              ? "Sim"
                              : "Não"
                            : key === "gender" || key === "clientType"
                              ? (patientProfileValueLabels[
                                  value as keyof typeof patientProfileValueLabels
                                ] ?? value)
                              : value}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </section>
          <InventoryPanel patientId={id} />
          {can("patients.timeline") && (
            <PatientTimelineSection patientId={id} />
          )}
          {clinical && canView("clinical") && (
            <ClinicalWorkspacePanel
              key={id}
              patients={[patient]}
              editable={canEdit("clinical")}
            />
          )}
          {editing && (
            <PatientModal
              patient={patient}
              configuredTags={tags}
              onClose={() => setEditing(false)}
              onSaved={(saved) => {
                setPatient(saved);
                setEditing(false);
              }}
            />
          )}
        </>
      )}
    </>
  );
}
