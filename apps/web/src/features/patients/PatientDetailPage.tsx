import {
  type Patient,
  patientFirstName,
  patientProfileLabels,
  patientProfileValueLabels,
} from "@crm/contracts";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { PageHeader } from "../../shared/components/PageHeader";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { usePatientTags } from "../../shared/hooks/usePatientTags";
import { formatIsoDate } from "../../shared/lib/formatting";
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
  const visibleLinks = links.filter((item) => canView(item.module));
  const fields = patient ? detailFields(patient) : [];
  return (
    <>
      <PageHeader
        back={{ to: "/clientes", label: "Voltar aos clientes" }}
        title={patient?.fullName ?? "Detalhes do cliente"}
        description={
          patient
            ? `${patient.recordNumber} · ${patient.status === "active" ? "Ativo" : "Inativo"}`
            : "Cadastro e acompanhamento"
        }
        action={
          <div className="page-actions">
            {patient && can("patients.update") && (
              <>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void changeStatus()}
                >
                  {patient.status === "active"
                    ? "Inativar cliente"
                    : "Reativar cliente"}
                </button>
                <button
                  className="primary-button"
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={16} aria-hidden="true" />
                  Editar cadastro
                </button>
              </>
            )}
          </div>
        }
      />
      {error && <ErrorBanner error={error} />}
      {!patient && !error && <LoadingBlock />}
      {patient && (
        <div className="patient-record">
          <PatientRecordTabs
            patient={patient}
            canEditClinical={canEdit("clinical")}
          />
          <section className="panel" aria-labelledby="patient-details-title">
            <div className="panel-head">
              <h2 id="patient-details-title">Dados cadastrais</h2>
            </div>
            <div className="patient-detail-body">
              {fields.length ? (
                <dl className="patient-detail-fields">
                  {fields.map(([key, label, value]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="patient-detail-empty">
                  Nenhum dado complementar cadastrado.
                </p>
              )}
            </div>
            {visibleLinks.length > 0 && (
              <div className="patient-detail-links">
                <span>Ver também</span>
                {visibleLinks.map((item) => (
                  <Link
                    className="secondary-button button-sm"
                    key={item.module}
                    to={`${item.to}?patientId=${encodeURIComponent(id)}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
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
        </div>
      )}
    </>
  );
}

/** Campos do cadastro preenchidos, já formatados: [chave, rótulo, valor]. */
function detailFields(patient: Patient) {
  const fields: [string, string, string][] = [];
  if (patient.cpf) fields.push(["cpf", "CPF", patient.cpf]);
  if (patient.birthDate)
    fields.push(["birthDate", "Nascimento", formatIsoDate(patient.birthDate)]);
  for (const [key, label] of Object.entries(patientProfileLabels)) {
    const value = patient[key as keyof typeof patientProfileLabels];
    if (
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && !value.length)
    )
      continue;
    fields.push([
      key,
      label,
      Array.isArray(value)
        ? value.join(", ")
        : typeof value === "boolean"
          ? value
            ? "Sim"
            : "Não"
          : key === "gender" || key === "clientType"
            ? (patientProfileValueLabels[
                value as keyof typeof patientProfileValueLabels
              ] ?? value)
            : key === "clientSince"
              ? formatIsoDate(value)
              : value,
    ]);
  }
  return fields;
}
