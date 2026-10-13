import type {
  ClinicalAppointmentOption,
  ClinicalRecord,
  PatientOption,
} from "@crm/contracts";
import { FileClock, FileText, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { ReadOnlyNotice } from "../../shared/components/ReadOnlyNotice";
import { professionalWithCrefito } from "../contracts/index";
import { ClinicalHistoryModal } from "./ClinicalHistoryModal";
import { ClinicalRecordModal } from "./ClinicalRecordModal";
import { ClinicalWorkspacePanel } from "./ClinicalWorkspacePanel";
import { FinalizeRecordModal } from "./FinalizeRecordModal";

export function ClinicalRecordsPage() {
  const { can, canEdit } = useAuthorization();
  const [records, setRecords] = useState<ClinicalRecord[]>([]);
  const [appointments, setAppointments] = useState<ClinicalAppointmentOption[]>(
    [],
  );
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<ClinicalRecord | "new" | null>(null);
  const [historyRecord, setHistoryRecord] = useState<ClinicalRecord | null>(
    null,
  );
  const [finalizing, setFinalizing] = useState<ClinicalRecord | null>(null);
  const canManage = canEdit("clinical");

  useEffect(() => {
    let active = true;
    const from = new Date();
    from.setDate(from.getDate() - 180);
    const to = new Date();
    to.setDate(to.getDate() + 2);
    Promise.all([
      api.clinicalRecords(),
      api.clinicalAppointmentOptions(from.toISOString(), to.toISOString()),
      api.patientOptions(),
    ])
      .then(([recordData, appointmentData, patientData]) => {
        if (!active) return;
        setRecords(recordData);
        setPatients(patientData);
        setAppointments(
          appointmentData.filter(
            (appointment) => appointment.status !== "cancelled",
          ),
        );
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

  function replaceRecord(record: ClinicalRecord) {
    setRecords((current) =>
      [record, ...current.filter((item) => item.id !== record.id)].sort(
        (a, b) => b.appointmentStartsAt.localeCompare(a.appointmentStartsAt),
      ),
    );
  }

  async function finalize(record: ClinicalRecord) {
    replaceRecord(await api.finalizeClinicalRecord(record.id));
    setFinalizing(null);
  }

  const availableAppointments = appointments.filter(
    (appointment) =>
      !records.some((record) => record.appointmentId === appointment.id),
  );

  return (
    <>
      <PageHeader
        eyebrow="Cuidado documentado"
        title="Prontuários"
        description="Evoluções clínicas no formato SOAP, protegidas e rastreáveis."
        action={
          canManage &&
          can("clinical.records_create") && (
            <button
              className="primary-button"
              onClick={() => setEditor("new")}
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
      <section className="clinical-summary">
        <div>
          <strong>{records.length}</strong>
          <span>evoluções registradas</span>
        </div>
        <div>
          <strong>
            {records.filter((record) => record.status === "draft").length}
          </strong>
          <span>rascunhos aguardando revisão</span>
        </div>
        <div className="clinical-security">
          <LockKeyhole size={18} />
          <span>Acesso restrito à equipe clínica</span>
        </div>
      </section>
      <section className="panel clinical-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Linha do tempo</span>
            <h2>Evoluções recentes</h2>
          </div>
        </div>
        {loading ? (
          <LoadingBlock />
        ) : records.length === 0 ? (
          <EmptyState
            title="Nenhuma evolução registrada"
            copy="Crie o primeiro prontuário a partir de um atendimento realizado."
          />
        ) : (
          <div className="clinical-list">
            {records.map((record) => (
              <article className="clinical-card" key={record.id}>
                <div className="clinical-date">
                  <strong>
                    {new Intl.DateTimeFormat("pt-BR", {
                      day: "2-digit",
                    }).format(new Date(record.appointmentStartsAt))}
                  </strong>
                  <span>
                    {new Intl.DateTimeFormat("pt-BR", {
                      month: "short",
                    }).format(new Date(record.appointmentStartsAt))}
                  </span>
                </div>
                <div className="clinical-card-copy">
                  <div>
                    <span className={`status-pill ${record.status}`}>
                      {record.status === "finalized"
                        ? "Finalizado"
                        : "Rascunho"}
                    </span>
                    <h3>{record.patientName}</h3>
                    <p>
                      {professionalWithCrefito(
                        record.professionalName,
                        record.professionalCrefito,
                      )}{" "}
                      · versão {record.version}
                    </p>
                  </div>
                  <p className="clinical-preview">
                    {record.assessment ||
                      "Avaliação clínica ainda não preenchida."}
                  </p>
                </div>
                <div className="clinical-card-actions">
                  <button
                    className="secondary-button button-sm"
                    onClick={() => setHistoryRecord(record)}
                  >
                    <FileClock size={16} />
                    Histórico
                  </button>
                  {canManage && record.status === "draft" && (
                    <>
                      {can("clinical.records_update") && (
                        <button
                          className="secondary-button button-sm"
                          onClick={() => setEditor(record)}
                        >
                          Editar
                        </button>
                      )}
                      {can("clinical.finalize") && (
                        <button
                          className="primary-button button-sm"
                          onClick={() => setFinalizing(record)}
                        >
                          Finalizar
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {!loading && patients.length > 0 && (
        <ClinicalWorkspacePanel patients={patients} editable={canManage} />
      )}
      {editor && (
        <ClinicalRecordModal
          record={editor === "new" ? undefined : editor}
          appointments={availableAppointments}
          onClose={() => setEditor(null)}
          onSaved={(record) => {
            replaceRecord(record);
            setEditor(null);
          }}
        />
      )}
      {historyRecord && (
        <ClinicalHistoryModal
          record={historyRecord}
          onClose={() => setHistoryRecord(null)}
        />
      )}
      {finalizing && (
        <FinalizeRecordModal
          record={finalizing}
          onClose={() => setFinalizing(null)}
          onConfirm={() => finalize(finalizing)}
        />
      )}
    </>
  );
}
