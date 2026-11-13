import { type Patient, patientFirstName } from "@crm/contracts";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { PageHeader } from "../../shared/components/PageHeader";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { usePatientTags } from "../../shared/hooks/usePatientTags";
import { PatientModal } from "./PatientModal";
import { PatientRecordTabs } from "./PatientRecordTabs";
import { SendToTrashModal, TrashIconButton } from "../trash";

export function PatientDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can, canEdit } = useAuthorization();
  const toast = useToast();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trashing, setTrashing] = useState(false);
  const tags = usePatientTags(true, true);
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
            {patient && can("trash.send") && (
              <TrashIconButton
                label="Excluir"
                disabled={busy}
                onClick={() => setTrashing(true)}
              />
            )}
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
          {trashing && (
            <SendToTrashModal
              kind="patients"
              id={patient.id}
              title={patient.fullName}
              onClose={() => setTrashing(false)}
              onDone={() => {
                toast.success(
                  `${patient.fullName} foi para a lixeira de Clientes.`,
                );
                navigate("/clientes");
              }}
            />
          )}
        </div>
      )}
    </>
  );
}
