import {
  latestAssessmentTemplates,
  type AssessmentTemplate,
  type AssessmentTemplateInput,
} from "@crm/contracts";
import { ClipboardList, Plus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { ClinicalFieldInputs } from "../../shared/components/ClinicalFieldInputs";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal } from "../../shared/components/Modal";
import { useToast } from "../../shared/feedback/toast-context";
import { shortDate } from "../../shared/lib/formatting";
import { useUnsavedChangesPrompt } from "../../shared/workflows/useUnsavedChangesPrompt";
import { AssessmentTemplateFields } from "./AssessmentTemplateFields";
import {
  assessmentTemplateCopy,
  blankAssessmentTemplate,
  missingTemplateFields,
} from "./assessment-forms";
import { AssessmentTemplateModal } from "./AssessmentTemplateModal";

/** Guarda de saída da aba "Criar modelo", usada pela página ao trocar de aba. */
export type ConfirmLeave = (proceed: () => void) => void;

function fieldCount(template: AssessmentTemplateInput) {
  const count = template.fields.filter(
    (field) => field.type !== "section",
  ).length;
  return `${count} ${count === 1 ? "pergunta" : "perguntas"}`;
}

/**
 * Aba "Modelos" de Prontuários: um item por modelo (última versão), com prévia, edição
 * (nova versão), duplicação e arquivamento. Arquivados ficam fora de "Registrar avaliação".
 */
export function AssessmentTemplateLibrary({
  onCreate,
  onDuplicate,
}: {
  onCreate: () => void;
  onDuplicate: (copy: AssessmentTemplateInput) => void;
}) {
  const { can, canEdit } = useAuthorization();
  const toast = useToast();
  const canManage = canEdit("clinical") && can("clinical.templates_create");
  const [templates, setTemplates] = useState<AssessmentTemplate[] | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [previewing, setPreviewing] = useState<AssessmentTemplate | null>(null);
  const [editing, setEditing] = useState<AssessmentTemplate | null>(null);
  const [toggling, setToggling] = useState<AssessmentTemplate | null>(null);

  useEffect(() => {
    let active = true;
    api
      .assessmentTemplates()
      .then((data) => active && setTemplates(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [version]);

  const reload = () => {
    setError("");
    setVersion((current) => current + 1);
  };
  const families = latestAssessmentTemplates(templates ?? [], {
    includeArchived: true,
  });
  const archivedCount = families.filter((item) => !item.active).length;
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const visible = families.filter(
    (item) =>
      (showArchived || item.active) &&
      (!term ||
        `${item.name} ${item.specialty}`
          .toLocaleLowerCase("pt-BR")
          .includes(term)),
  );
  const publishedVersion = (template: AssessmentTemplate) =>
    latestAssessmentTemplates(
      (templates ?? []).filter(
        (item) =>
          (item.familyId ?? item.id) === (template.familyId ?? template.id),
      ),
      { publishedOnly: true, includeArchived: true },
    )[0];

  return (
    <section className="panel assessment-template-library">
      <div className="panel-head">
        <div>
          <h2>Modelos de avaliação</h2>
          <p className="panel-context">
            Formulários preenchidos online no prontuário do cliente.
          </p>
        </div>
        <div className="page-actions">
          <span className="list-count">{visible.length}</span>
          {canManage && (
            <button
              type="button"
              className="primary-button button-sm"
              onClick={onCreate}
            >
              <Plus size={15} aria-hidden="true" /> Novo modelo
            </button>
          )}
        </div>
      </div>
      {error && <ErrorBanner error={error} />}
      {!templates ? (
        error ? null : (
          <LoadingBlock />
        )
      ) : (
        <>
          <div className="list-toolbar assessment-template-toolbar">
            <label>
              Buscar modelo
              <input
                type="search"
                value={search}
                placeholder="Nome ou especialidade"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            {archivedCount > 0 && (
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
                Mostrar arquivados ({archivedCount})
              </label>
            )}
          </div>
          {visible.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={
                families.length ? "Nenhum modelo encontrado" : "Nenhum modelo"
              }
              copy={
                families.length
                  ? "Ajuste a busca ou mostre os arquivados."
                  : canManage
                    ? "Crie o primeiro modelo na aba Criar modelo."
                    : "Nenhum modelo foi criado ainda."
              }
            />
          ) : (
            <ul className="assessment-template-list">
              {visible.map((template) => {
                const published = publishedVersion(template);
                return (
                  <li key={template.id}>
                    <div>
                      <strong>{template.name}</strong>
                      <span>
                        {[
                          template.specialty,
                          fieldCount(template),
                          `versão ${template.version}`,
                          `desde ${shortDate.format(new Date(template.createdAt))}`,
                        ].join(" · ")}
                      </span>
                      {template.status === "draft" && published && (
                        <span>
                          Em uso: versão {published.version}. Publique o
                          rascunho para substituí-la.
                        </span>
                      )}
                    </div>
                    <span
                      className={`status-pill ${
                        !template.active
                          ? "cancelled"
                          : template.status === "draft"
                            ? "draft"
                            : "active"
                      }`}
                    >
                      {!template.active
                        ? "Arquivado"
                        : template.status === "draft"
                          ? "Rascunho"
                          : "Publicado"}
                    </span>
                    <div className="assessment-template-actions">
                      <button
                        type="button"
                        className="secondary-button button-sm"
                        aria-label={`Visualizar ${template.name}`}
                        onClick={() => setPreviewing(template)}
                      >
                        Visualizar
                      </button>
                      {canManage && template.active && (
                        <button
                          type="button"
                          className="secondary-button button-sm"
                          aria-label={`Editar ${template.name}`}
                          onClick={() => setEditing(template)}
                        >
                          Editar
                        </button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className="secondary-button button-sm"
                          aria-label={`Duplicar ${template.name}`}
                          onClick={() =>
                            onDuplicate(assessmentTemplateCopy(template))
                          }
                        >
                          Duplicar
                        </button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className={`${template.active ? "danger-button" : "secondary-button"} button-sm`}
                          aria-label={`${template.active ? "Arquivar" : "Reativar"} ${template.name}`}
                          onClick={() => setToggling(template)}
                        >
                          {template.active ? "Arquivar" : "Reativar"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {previewing && (
        <Modal
          eyebrow="Prontuários"
          title={previewing.name}
          subtitle={`${previewing.specialty} · ${fieldCount(previewing)} · versão ${previewing.version}`}
          onClose={() => setPreviewing(null)}
          wide
        >
          <div className="clinical-form">
            <fieldset disabled className="assessment-preview">
              <legend>Prévia do formulário</legend>
              <ClinicalFieldInputs
                fields={previewing.fields}
                values={{}}
                onChange={() => {}}
              />
            </fieldset>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPreviewing(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </Modal>
      )}
      {editing && (
        <AssessmentTemplateModal
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            toast.success(
              saved.status === "draft"
                ? `Rascunho de “${saved.name}” salvo.`
                : `Modelo “${saved.name}” publicado na versão ${saved.version}.`,
            );
            reload();
          }}
        />
      )}
      {toggling && (
        <ActionModal
          eyebrow="Prontuários"
          title={toggling.active ? "Arquivar modelo" : "Reativar modelo"}
          subtitle={toggling.name}
          effect={
            toggling.active
              ? "O modelo deixa de aparecer em Registrar avaliação. As avaliações já preenchidas com ele continuam no prontuário."
              : "O modelo volta a aparecer em Registrar avaliação."
          }
          confirmLabel={toggling.active ? "Arquivar modelo" : "Reativar modelo"}
          danger={toggling.active}
          onClose={() => setToggling(null)}
          onConfirm={async () => {
            await api.setAssessmentTemplateActive(
              toggling.id,
              !toggling.active,
            );
            toast.success(
              toggling.active
                ? `Modelo “${toggling.name}” arquivado.`
                : `Modelo “${toggling.name}” reativado.`,
            );
            setToggling(null);
            reload();
          }}
        />
      )}
    </section>
  );
}

/**
 * Aba "Criar modelo": começa do zero ou a partir de um modelo existente (duplicado), como
 * em Contratos. Salvar como rascunho deixa o modelo fora de "Registrar avaliação".
 */
export function AssessmentTemplateStudio({
  initial,
  onCreated,
  onLeaveGuard,
}: {
  /** Modelo de partida (ex.: "Duplicar" na aba Modelos). */
  initial?: AssessmentTemplateInput | undefined;
  onCreated: (template: AssessmentTemplate) => void;
  /** Recebe a guarda que pergunta antes de descartar alterações (troca de aba). */
  onLeaveGuard?: (guard: ConfirmLeave | null) => void;
}) {
  const toast = useToast();
  const start = initial ?? blankAssessmentTemplate;
  const [form, setForm] = useState<AssessmentTemplateInput>(() =>
    structuredClone(start),
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(start));
  const [bases, setBases] = useState<AssessmentTemplate[]>([]);
  const [baseId, setBaseId] = useState("");
  const [replacing, setReplacing] = useState<AssessmentTemplateInput | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const missing = useMissingFields(missingTemplateFields(form), "field-hint");
  const dirty = JSON.stringify(form) !== baseline;

  useEffect(() => {
    let active = true;
    api
      .assessmentTemplates()
      .then(
        (data) =>
          active &&
          setBases(latestAssessmentTemplates(data, { publishedOnly: true })),
      )
      // Sem a lista, ainda dá para começar do zero.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function save(status: "draft" | "published") {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const created = await api.saveAssessmentTemplate({ ...form, status });
      setBaseline(JSON.stringify(form));
      toast.success(
        status === "draft"
          ? `Rascunho de “${created.name}” salvo.`
          : `Modelo “${created.name}” publicado.`,
      );
      onCreated(created);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const prompt = useUnsavedChangesPrompt({
    section: "Modelo de avaliação",
    dirty,
    busy: saving,
    save: () => save("draft"),
    discard: () => setForm(JSON.parse(baseline) as AssessmentTemplateInput),
  });
  const { confirmLeave } = prompt;
  useEffect(() => {
    onLeaveGuard?.(confirmLeave);
    return () => onLeaveGuard?.(null);
  }, [onLeaveGuard, confirmLeave]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const button = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    void save(button?.value === "draft" ? "draft" : "published").catch(
      (cause: Error) => setError(cause.message),
    );
  }
  function choose(next: AssessmentTemplateInput) {
    if (dirty) setReplacing(next);
    else {
      setForm(next);
      setBaseline(JSON.stringify(next));
    }
  }
  const base = bases.find((item) => item.id === baseId);

  return (
    <section className="panel template-studio-panel">
      <div className="panel-head">
        <div>
          <h2>Novo modelo</h2>
          <p className="panel-context">
            Comece do zero ou a partir de um modelo existente e monte as
            perguntas. O formulário é preenchido online no prontuário do
            cliente.
          </p>
        </div>
      </div>
      <form className="clinical-form assessment-studio-form" onSubmit={submit}>
        {error && <ErrorBanner error={error} />}
        <div className="assessment-studio-base">
          <button
            type="button"
            className="secondary-button"
            disabled={saving}
            onClick={() => choose(structuredClone(blankAssessmentTemplate))}
          >
            Começar do zero
          </button>
          <label>
            Partir de um modelo
            <select
              value={baseId}
              disabled={saving || bases.length === 0}
              onChange={(event) => setBaseId(event.target.value)}
            >
              <option value="">Selecione</option>
              {bases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={saving || !base}
            onClick={() => base && choose(assessmentTemplateCopy(base))}
          >
            Usar como base
          </button>
        </div>
        <fieldset className="form-fields" disabled={saving}>
          <AssessmentTemplateFields form={form} onChange={setForm} />
        </fieldset>
        {missing.hint}
        <div className="modal-actions">
          <button
            className="secondary-button"
            value="draft"
            disabled={saving || missing.blocked}
            aria-describedby={missing.describedBy}
          >
            Salvar rascunho
          </button>
          <button
            className="primary-button"
            value="published"
            disabled={saving || missing.blocked}
            aria-describedby={missing.describedBy}
          >
            {saving ? "Salvando…" : "Publicar modelo"}
          </button>
        </div>
      </form>
      {prompt.modal}
      {replacing && (
        <ActionModal
          eyebrow="Prontuários"
          title="Substituir perguntas?"
          subtitle="Você tem alterações neste modelo."
          effect="O nome e as perguntas atuais serão substituídos pela opção escolhida."
          confirmLabel="Substituir"
          onClose={() => setReplacing(null)}
          onConfirm={async () => {
            setForm(replacing);
            setBaseline(JSON.stringify(replacing));
            setReplacing(null);
          }}
        />
      )}
    </section>
  );
}
