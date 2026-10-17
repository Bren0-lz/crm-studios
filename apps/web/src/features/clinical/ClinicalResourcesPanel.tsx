import { useClinicTimezone } from "../../shared/hooks/useClinicTimezone";
import { clinicIsoDate, formatIsoDate } from "../../shared/lib/formatting";
import {
  clinicalResourceLabels,
  type ClinicalResource,
  type ClinicalResourceInput,
  type ClinicalResourceKind,
  type ClinicalSource,
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
import { ClinicalResourceEditor } from "./ClinicalResourceEditor";

function ResourceContent({
  data,
  resources,
  templateSnapshot,
}: {
  data: ClinicalResourceInput;
  resources: ClinicalResource[];
  templateSnapshot?: ClinicalResource["templateSnapshot"] | undefined;
}) {
  const label = (id: string) =>
    resources.find((item) => item.id === id)?.name ?? "Cadastro histórico";
  const display = (value: unknown) =>
    Array.isArray(value)
      ? value.join(", ")
      : typeof value === "boolean"
        ? value
          ? "Sim"
          : "Não"
        : String(value ?? "");
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
      {"body" in data &&
        data.body &&
        !(data.kind === "evolution" && data.format === "soap") && (
          <p className="clinical-resource-text">{data.body}</p>
        )}
      {data.kind === "evolution_template" &&
        data.format === "questionnaire" &&
        data.fields.map((field) => (
          <p key={field.key}>
            {field.label}
            {field.required ? " · obrigatório" : ""}
            {field.options?.length ? ` · ${field.options.join(", ")}` : ""}
          </p>
        ))}
      {data.kind === "evolution" && (
        <>
          {data.format === "soap" &&
            (
              [
                ["subjective", "Subjetivo"],
                ["objective", "Objetivo"],
                ["assessment", "Avaliação"],
                ["plan", "Plano"],
              ] as const
            ).map(([key, title]) => (
              <div key={key}>
                <h3>{title}</h3>
                <p className="clinical-resource-text">{data[key]}</p>
              </div>
            ))}
          {data.format === "questionnaire" &&
            (templateSnapshot?.fields ?? [])
              .filter((field) => field.type !== "section")
              .map((field) => (
                <p key={field.key}>
                  <strong>{field.label}:</strong>{" "}
                  {display(data.values[field.key])}
                </p>
              ))}
          {data.equipmentIds.length > 0 && (
            <p>Aparelhos: {data.equipmentIds.map(label).join(", ")}</p>
          )}
          {data.exerciseIds.length > 0 && (
            <p>Exercícios: {data.exerciseIds.map(label).join(", ")}</p>
          )}
        </>
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
  const timezone = useClinicTimezone();
  const [opened, setOpened] = useState(false),
    [kind, setKind] = useState<ClinicalResourceKind>(
      catalogOnly ? "equipment" : "evolution",
    ),
    [resources, setResources] = useState<ClinicalResource[] | null>(null),
    [sources, setSources] = useState<ClinicalSource[]>([]),
    [professionals, setProfessionals] = useState<Professional[]>([]),
    [muscles, setMuscles] = useState<ClinicCatalogEntry[]>([]),
    [error, setError] = useState("");
  const [editor, setEditor] = useState<{
      kind: ClinicalResourceKind;
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
    const [items, sourceData, professionalData, muscleData] = await Promise.all(
      [
        catalogOnly
          ? api.clinicalResourceCatalog()
          : api.clinicalResources(patientId),
        catalogOnly ? Promise.resolve([]) : api.clinicalSources(patientId),
        catalogOnly ? Promise.resolve([]) : api.professionals(),
        api.clinicCatalog("muscle_group"),
      ],
    );
    setResources(items);
    setSources(sourceData);
    setProfessionals(professionalData);
    setMuscles(muscleData);
  }
  useEffect(() => {
    if (!opened) return;
    let alive = true;
    Promise.all([
      api.clinicalResources(patientId),
      api.clinicalSources(patientId),
      api.professionals(),
      api.clinicCatalog("muscle_group"),
    ])
      .then(([items, sourceData, professionalData, muscleData]) => {
        if (alive) {
          setResources(items);
          setSources(sourceData);
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
    kind === "evolution" || kind === "clinical_document"
      ? can("clinical.records_create")
      : kind === "evolution_template"
        ? can("clinical.templates_create")
        : can("clinical.resources_manage");
  function recordDate(item: ClinicalResource) {
    if (item.data.kind === "evolution")
      return clinicIsoDate(
        item.originStartsAt ??
          sources.find(
            (source) =>
              source.id ===
              (item.data.kind === "evolution" ? item.data.sourceId : ""),
          )?.startsAt ??
          item.createdAt,
        timezone,
      );
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
  return (
    <details
      className="clinical-resource-panel"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary>
        {catalogOnly
          ? "Aparelhos, exercícios e modelos de evolução"
          : "Modelos, evoluções e treinos"}
      </summary>
      {opened && (
        <div className="clinical-resource-body">
          {error && <ErrorBanner error={error} />}
          <div className="list-toolbar">
            <label>
              Seção
              <select
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as ClinicalResourceKind)
                }
              >
                {Object.entries(clinicalResourceLabels)
                  .filter(
                    ([key]) =>
                      !catalogOnly ||
                      ["equipment", "exercise", "evolution_template"].includes(
                        key,
                      ),
                  )
                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
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
                  ? "Os aparelhos, exercícios e modelos compartilhados da clínica aparecem aqui."
                  : "Os registros clínicos e treinos do cliente aparecerão aqui."
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
                    (item.kind === "evolution" ||
                    item.kind === "clinical_document"
                      ? can("clinical.records_update")
                      : item.kind === "evolution_template"
                        ? can("clinical.templates_create")
                        : can("clinical.resources_manage")) && (
                      <button
                        className="secondary-button"
                        onClick={() =>
                          setEditor({ kind: item.kind, resource: item })
                        }
                      >
                        Editar
                      </button>
                    )}
                  {item.kind === "training" &&
                    can("clinical.resources_manage") && (
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
                  {["evolution", "clinical_document"].includes(item.kind) &&
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
              sources={sources}
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
              <ResourceContent
                data={view.data}
                resources={resources ?? []}
                templateSnapshot={view.templateSnapshot}
              />
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
                        templateSnapshot={view.templateSnapshot}
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
                <h1>
                  {patients.find((item) => item.id === patientId)?.fullName}
                </h1>
                <h2>{clinicalResourceLabels[kind]}</h2>
                {printing.map((item) => (
                  <article key={item.id}>
                    <h3>{item.name}</h3>
                    <p>
                      {item.authorName} · versão {item.version}
                    </p>
                    <ResourceContent
                      data={item.data}
                      resources={resources ?? []}
                      templateSnapshot={item.templateSnapshot}
                    />
                  </article>
                ))}
              </section>,
              document.body,
            )}
        </div>
      )}
    </details>
  );
}
