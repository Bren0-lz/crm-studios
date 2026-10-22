import {
  type Patient,
  patientFirstName,
  patientProfileLabels,
  patientProfileValueLabels,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { PageHeader } from "../../shared/components/PageHeader";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { usePatientTags } from "../../shared/hooks/usePatientTags";
import { PatientModal } from "./PatientModal";
import { PatientRecordTabs } from "./PatientRecordTabs";

export function PatientDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can, canView, canEdit } = useAuthorization();
  const toast = useToast();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
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
      const updated = await api.setPatientStatus(
        id,
        patient.status === "active" ? "inactive" : "active",
      );
      setPatient(updated);
      toast.success(
        `Cadastro de ${patientFirstName(updated.fullName)} ${updated.status === "active" ? "reativado" : "inativado"}.`,
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // Agenda, planos, financeiro e contratos ficam nas abas da ficha (U14).
  const links = [
    { module: "groups", to: "/turmas", label: "Turmas" },
    {
      module: "relationship",
      to: "/relacionamento",
      label: "Contatos sugeridos",
    },
    { module: "communications", to: "/comunicacoes", label: "Comunicações" },
  ] as const;
  return (
    <>
      <PageHeader
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
          <PatientRecordTabs
            patient={patient}
            canEditClinical={canEdit("clinical")}
          />
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
              </div>
              <dl className="patient-detail-fields">
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
