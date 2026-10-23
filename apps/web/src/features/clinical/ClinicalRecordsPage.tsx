import {
  patientFirstName,
  type ClinicalAppointmentOption,
  type ClinicalRecord,
  type PatientOption,
} from "@crm/contracts";
import { ArrowLeft, FileText, Stethoscope } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import { useToast } from "../../shared/feedback/toast-context";
import { ClinicalChart } from "./ClinicalChart";
import { ClinicalPatientList } from "./ClinicalPatientList";
import { ClinicalRecordModal } from "./ClinicalRecordModal";
import {
  buildPatientSummaries,
  clinicalAppointmentRange,
  evolvableAppointments,
} from "./model";

/**
 * Prontuários por cliente: à esquerda a lista com busca e pendências, à direita o prontuário
 * do cliente escolhido (`?cliente=<id>`, que também serve de link direto).
 */
export function ClinicalRecordsPage() {
  const { can, canEdit } = useAuthorization();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [records, setRecords] = useState<ClinicalRecord[]>([]);
  const [appointments, setAppointments] = useState<ClinicalAppointmentOption[]>(
    [],
  );
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  // Recarrega o prontuário aberto depois de uma evolução criada pelo cabeçalho.
  const [chartVersion, setChartVersion] = useState(0);
  const canManage = canEdit("clinical");
  const selectedId = searchParams.get("cliente") ?? undefined;

  useEffect(() => {
    let active = true;
    Promise.all([
      api.clinicalRecords(),
      api.clinicalAppointmentOptions(...clinicalAppointmentRange()),
      api.patientOptions(),
    ])
      .then(([recordData, appointmentData, patientData]) => {
        if (!active) return;
        setRecords(recordData);
        setPatients(patientData);
        setAppointments(evolvableAppointments(appointmentData));
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

  function replaceRecord(record: ClinicalRecord) {
    setRecords((current) =>
      [record, ...current.filter((item) => item.id !== record.id)].sort(
        (a, b) => b.appointmentStartsAt.localeCompare(a.appointmentStartsAt),
      ),
    );
  }

  const availableAppointments = appointments.filter(
    (appointment) =>
      !records.some((record) => record.appointmentId === appointment.id),
  );
  const summaries = buildPatientSummaries(patients, records, appointments);
  const selected = summaries.find((item) => item.patient.id === selectedId);
  const totalPending = summaries.reduce(
    (total, item) => total + item.pending.length,
    0,
  );
  const totalDrafts = records.filter((item) => item.status === "draft").length;

  return (
    <>
      <PageHeader
        title="Prontuários"
        description="Evoluções, avaliações, metas e arquivos de cada cliente, num só lugar."
        action={
          canManage &&
          can("clinical.records_create") && (
            <button
              className="primary-button"
              onClick={() => setCreating(true)}
              disabled={availableAppointments.length === 0}
              title={
                availableAppointments.length === 0
                  ? "Todos os atendimentos disponíveis já possuem prontuário"
                  : undefined
              }
            >
              <FileText size={18} />
              Nova evolução
            </button>
          )
        }
      />
      {!canManage && <ReadOnlyNotice module="clinical" />}
      {error && <ErrorBanner error={error} />}
      {loading ? (
        <LoadingBlock />
      ) : (
        <div
          className={`clinical-records-layout${selected ? " has-selection" : ""}`}
        >
          <div className="clinical-records-aside">
            {(totalPending > 0 || totalDrafts > 0) && (
              <p className="clinical-records-summary">
                {[
                  totalPending > 0
                    ? `${totalPending} ${totalPending === 1 ? "sessão" : "sessões"} sem evolução`
                    : null,
                  totalDrafts > 0
                    ? `${totalDrafts} ${totalDrafts === 1 ? "rascunho" : "rascunhos"} para finalizar`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <ClinicalPatientList
              summaries={summaries}
              selectedId={selected?.patient.id}
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
                  key={`${selected.patient.id}-${chartVersion}`}
                  patientId={selected.patient.id}
                  editable={canManage}
                  appointments={selected.pending}
                  onRecordChanged={replaceRecord}
                />
              </>
            ) : records.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Nenhuma evolução registrada"
                copy="Crie o primeiro prontuário a partir de um atendimento realizado."
                action={
                  canManage &&
                  can("clinical.records_create") &&
                  availableAppointments.length > 0 ? (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => setCreating(true)}
                    >
                      <FileText size={18} /> Registrar primeira evolução
                    </button>
                  ) : undefined
                }
              />
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
      {creating && (
        <ClinicalRecordModal
          record={undefined}
          appointments={availableAppointments}
          onClose={() => setCreating(false)}
          onSaved={(record) => {
            toast.success(
              `Evolução de ${patientFirstName(record.patientName)} salva.`,
            );
            replaceRecord(record);
            setCreating(false);
            setChartVersion((current) => current + 1);
            select(record.patientId);
          }}
        />
      )}
    </>
  );
}
