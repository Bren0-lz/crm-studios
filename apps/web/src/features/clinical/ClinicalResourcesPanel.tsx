import { useClinicTimezone } from "../../shared/hooks/useClinicTimezone";
import { clinicIsoDate, formatIsoDate } from "../../shared/lib/formatting";
import {
  clinicalResourceLabels,
  type ClinicalResource,
  type ClinicalResourceInput,
  type ClinicCatalogEntry,
  type PatientOption,
  type Professional,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { EmptyState } from "../../shared/components/EmptyState";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import {
  ClinicalResourceEditor,
  type EditableResourceKind,
} from "./ClinicalResourceEditor";
import { useToast } from "../../shared/feedback/toast-context";

/** Cadastros compartilhados da clínica (sub-aba de Cadastros). */
const catalogKinds: EditableResourceKind[] = ["equipment", "exercise"];
/**
 * Seções do prontuário. Evoluções e modelos de evolução saíram da interface: registros
 * antigos continuam só na API e na exportação.
 */
const patientKinds: EditableResourceKind[] = [
  "equipment",
  "exercise",
  "training",
  "training_execution",
  "clinical_document",
];

function ResourceContent({
  data,
  resources,
}: {
  data: ClinicalResourceInput;
  resources: ClinicalResource[];
}) {
  const label = (id: string) =>
    resources.find((item) => item.id === id)?.name ?? "Cadastro histórico";
  return (
    <div className="clinical-resource-content">
      {"image" in data && data.image && (
        <img
          className="clinical-resource-image"
          src={data.image}
          alt={data.name}
        />
      )}
      {"description" in data && <p>{data.description}</p>}
      {data.kind === "exercise" && (
        <>
          <p>
            {data.equipmentId
              ? `Aparelho: ${label(data.equipmentId)}`
              : "Sem aparelho"}
            {data.level ? ` · ${data.level}` : ""}
          </p>
          {data.videoUrl && (
            <a
              className="secondary-button"
              href={data.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir vídeo
            </a>
          )}
        </>
      )}
      {"body" in data && data.body && (
        <p className="clinical-resource-text">{data.body}</p>
      )}
      {data.kind === "training" && (
        <>
          <p>
            Vigência: {formatIsoDate(data.validFrom)}{" "}
            {data.validUntil ? `até ${formatIsoDate(data.validUntil)}` : ""}
            {data.sessionLimit ? ` · ${data.sessionLimit} execuções` : ""}
          </p>
          <ol>
            {data.exercises.map((entry) => (
              <li key={entry.exerciseId}>
                <strong>{label(entry.exerciseId)}</strong> · {entry.sets} séries
                · {entry.repetitions} repetições · pausa de {entry.restSeconds}s
                {entry.notes ? ` · ${entry.notes}` : ""}
              </li>
            ))}
          </ol>
          <p>{data.notes}</p>
        </>
      )}
      {data.kind === "training_execution" && (
        <>
          <p>Treino: {label(data.trainingId)}</p>
          <p>Início: {new Date(data.startedAt).toLocaleString("pt-BR")}</p>
          <p>
            {data.endedAt
              ? `Concluído em ${new Date(data.endedAt).toLocaleString("pt-BR")}`
              : "Em andamento"}
          </p>
          <p>{data.notes}</p>
        </>
      )}
    </div>
  );
}
export function ClinicalResourcesPanel({
  patientId,
  patients,
  catalogOnly = false,
}: {
  patientId: string;
  patients: PatientOption[];
  catalogOnly?: boolean;
}) {
  const { can } = useAuthorization();
  const toast = useToast();
  const timezone = useClinicTimezone();
  const [opened, setOpened] = useState(catalogOnly),
    [kind, setKind] = useState<EditableResourceKind>(
      catalogOnly ? "equipment" : "training",
    ),
    [resources, setResources] = useState<ClinicalResource[] | null>(null),
    [professionals, setProfessionals] = useState<Professional[]>([]),
    [muscles, setMuscles] = useState<ClinicCatalogEntry[]>([]),
    [error, setError] = useState("");
  const [editor, setEditor] = useState<{
      kind: EditableResourceKind;
      resource?: ClinicalResource;
      copy?: boolean;
    } | null>(null),
    [view, setView] = useState<ClinicalResource | null>(null),
    [finalizing, setFinalizing] = useState<ClinicalResource | null>(null),
    [busy, setBusy] = useState(false),
    [printing, setPrinting] = useState<ClinicalResource[] | null>(null),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  async function load() {
    const [items, professionalData, muscleData] = await Promise.all([
      catalogOnly
        ? api.clinicalResourceCatalog()
        : api.clinicalResources(patientId),
      catalogOnly ? Promise.resolve([]) : api.professionals(),
      api.clinicCatalog("muscle_group"),
    ]);
    setResources(items);
    setProfessionals(professionalData);
    setMuscles(muscleData);
  }
  useEffect(() => {
    if (!opened) return;
    let alive = true;
    Promise.all([
      catalogOnly
        ? api.clinicalResourceCatalog()
        : api.clinicalResources(patientId),
      catalogOnly ? Promise.resolve([]) : api.professionals(),
      api.clinicCatalog("muscle_group"),
    ])
      .then(([items, professionalData, muscleData]) => {
        if (alive) {
          setResources(items);
          setProfessionals(professionalData);
          setMuscles(muscleData);
        }
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [opened, patientId, catalogOnly]);
  useEffect(() => {
    if (!printing) return;
    const clear = () => setPrinting(null);
    window.addEventListener("afterprint", clear);
    window.print();
    return () => window.removeEventListener("afterprint", clear);
  }, [printing]);
  const canManage =
    kind === "clinical_document"
      ? can("clinical.records_create")
      : can("clinical.resources_manage");
  function recordDate(item: ClinicalResource) {
    if (item.data.kind === "training_execution")
      return clinicIsoDate(item.data.startedAt, timezone);
    if (item.data.kind === "training") return item.data.validFrom;
    return clinicIsoDate(item.createdAt, timezone);
  }
  const visible = (resources ?? []).filter(
    (item) =>
      item.kind === kind &&
      (!from || recordDate(item) >= from) &&
      (!to || recordDate(item) <= to),
  );
  async function finalize() {
    if (!finalizing) return;
    setBusy(true);
    setError("");
    try {
      await api.finalizeClinicalResource(finalizing.id);
      toast.success("Registro clínico finalizado.");
      await load();
      setFinalizing(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function print() {
    setError("");
    try {
      const items = await api.clinicalResources(patientId, true);
      setPrinting(
        items.filter(
          (item) =>
            item.kind === kind &&
            (!from || recordDate(item) >= from) &&
            (!to || recordDate(item) <= to),
        ),
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  // No catálogo (sub-aba de Cadastros) a lista já aparece aberta, sem o bloco recolhível.
  const body = opened && (
    <div className="clinical-resource-body">
      {error && <ErrorBanner error={error} />}
      <div className="list-toolbar">
        <label>
          Seção
          <select
            value={kind}
            onChange={(event) =>
              setKind(event.target.value as EditableResourceKind)
            }
          >
            {(catalogOnly ? catalogKinds : patientKinds).map((key) => (
              <option key={key} value={key}>
                {clinicalResourceLabels[key]}
              </option>
            ))}
          </select>
        </label>
        {canManage && (
          <button
            className="primary-button"
            onClick={() => setEditor({ kind })}
          >
            Novo registro
          </button>
        )}
        {!catalogOnly && can("clinical.export") && (
          <button className="secondary-button" onClick={() => void print()}>
            Imprimir período
          </button>
        )}
      </div>
      {!catalogOnly && (
        <div className="form-grid">
          <label>
            Data inicial
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            Data final
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
      )}
      {!resources ? (
        !error && <LoadingBlock />
      ) : !visible.length ? (
        <EmptyState
          title="Nenhum registro nesta seção"
          copy={
            catalogOnly
              ? "Os aparelhos e exercícios compartilhados da clínica aparecem aqui."
              : "Os treinos, relatórios e prescrições do cliente aparecerão aqui."
          }
        />
      ) : (
        visible.map((item) => (
          <article className="clinical-resource-card" key={item.id}>
            <h3>{item.name}</h3>
            <p>
              {item.status === "finalized"
                ? "Finalizado"
                : item.status === "published"
                  ? "Publicado"
                  : item.status === "draft"
                    ? "Rascunho"
                    : item.status === "inactive"
                      ? "Inativo"
                      : "Ativo"}{" "}
              · versão {item.version} · {item.authorName}
            </p>
            <div className="page-actions">
              <button
                className="secondary-button"
                onClick={() => setView(item)}
              >
                Visualizar
              </button>
              {item.status !== "finalized" &&
                (item.kind === "clinical_document"
                  ? can("clinical.records_update")
                  : can("clinical.resources_manage")) && (
                  <button
                    className="secondary-button"
                    onClick={() => setEditor({ kind, resource: item })}
                  >
                    Editar
                  </button>
                )}
              {item.kind === "training" && can("clinical.resources_manage") && (
                <button
                  className="secondary-button"
                  onClick={() =>
                    setEditor({
                      kind: "training",
                      resource: item,
                      copy: true,
                    })
                  }
                >
                  Copiar treino
                </button>
              )}
              {item.kind === "clinical_document" &&
                item.status !== "finalized" &&
                can("clinical.finalize") && (
                  <button
                    className="primary-button"
                    onClick={() => setFinalizing(item)}
                  >
                    Finalizar
                  </button>
                )}
            </div>
          </article>
        ))
      )}
      {editor && (
        <ClinicalResourceEditor
          kind={editor.kind}
          resource={editor.resource}
          copy={editor.copy ?? false}
          patientId={patientId}
          patients={patients}
          professionals={professionals}
          resources={resources ?? []}
          muscleGroups={muscles}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}
      {view && (
        <Modal
          title={view.name}
          subtitle={`${view.authorName} · versão ${view.version}`}
          onClose={() => setView(null)}
          wide
        >
          <ResourceContent data={view.data} resources={resources ?? []} />
          {view.history.length > 0 && (
            <details>
              <summary>Histórico de alterações</summary>
              {view.history.map((entry) => (
                <section key={entry.version}>
                  <h3>
                    Versão {entry.version} · {entry.authorName}
                  </h3>
                  <ResourceContent
                    data={entry.data}
                    resources={resources ?? []}
                  />
                </section>
              ))}
            </details>
          )}
        </Modal>
      )}
      {finalizing && (
        <Modal
          title="Finalizar registro clínico"
          subtitle="Após finalizar, o conteúdo será preservado sem permitir alterações."
          busy={busy}
          onClose={() => setFinalizing(null)}
        >
          {error && <ErrorBanner error={error} />}
          <div className="modal-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setFinalizing(null)}
            >
              Cancelar
            </button>
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void finalize()}
            >
              Confirmar finalização
            </button>
          </div>
        </Modal>
      )}
      {printing &&
        createPortal(
          <section className="clinical-print-sheet">
            <h1>{patients.find((item) => item.id === patientId)?.fullName}</h1>
            <h2>{clinicalResourceLabels[kind]}</h2>
            {printing.map((item) => (
              <article key={item.id}>
                <h3>{item.name}</h3>
                <p>
                  {item.authorName} · versão {item.version}
                </p>
                <ResourceContent data={item.data} resources={resources ?? []} />
              </article>
            ))}
          </section>,
          document.body,
        )}
    </div>
  );
  if (catalogOnly) return body;
  return (
    <details
      className="clinical-resource-panel"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary>Treinos, relatórios e prescrições</summary>
      {body}
    </details>
  );
}
