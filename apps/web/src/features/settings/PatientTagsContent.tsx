import { withPrefix, withQuotedPrefix } from "@crm/contracts";
import {
  patientTagCategoryLabels,
  patientTagDisplayColor,
  type PatientTagCategory,
} from "@crm/contracts";
import { TagCategorySelect } from "./TagCategorySelect";
import { DEFAULT_PATIENT_TAG_COLOR, type PatientTag } from "@crm/contracts";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiClientError } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ActionModal } from "../../shared/components/ActionModal";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PatientTagBadge } from "../../shared/components/PatientTagBadge";
import { useSettingsBusy } from "../../shared/workflows/useSettingsBusy";
import { countLabel } from "../patients/index";
import { sortPatientTags } from "./model";
import { PatientTagEditModal } from "./PatientTagEditModal";
import { TagColorPicker } from "./TagColorPicker";
import { useUnsavedChangesPrompt } from "./useUnsavedChangesPrompt";

export function PatientTagsContent({ canEdit }: { canEdit: boolean }) {
  const { can } = useAuthorization();
  const [tags, setTags] = useState<PatientTag[] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    color: DEFAULT_PATIENT_TAG_COLOR,
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [baselineColor, setBaselineColor] = useState(DEFAULT_PATIENT_TAG_COLOR);
  const [category, setCategory] = useState<PatientTagCategory | "">("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const savingRef = useRef(false);
  useSettingsBusy(saving);
  const [editing, setEditing] = useState<PatientTag | null>(null);
  const [deleting, setDeleting] = useState<PatientTag | null>(null);

  useEffect(() => {
    let active = true;
    api
      .patientTags()
      .then((data) => active && setTags(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [attempt]);

  async function save() {
    if (savingRef.current) return;
    const name = form.name.trim();
    if (!name) throw new Error("Informe o nome da etiqueta.");
    savingRef.current = true;
    setSaving(true);
    setNotice("");
    setFormError("");
    try {
      const created = await api.createPatientTag({
        name,
        color: form.color,
        ...(category ? { category } : {}),
      });
      setTags((items) => sortPatientTags([...(items ?? []), created]));
      setForm({ name: "", color: form.color });
      setCategory("");
      setBaselineColor(form.color);
      setNotice("Etiqueta criada.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const dirty =
    canEdit &&
    can("settings.tags_create") &&
    Boolean(form.name || form.color !== baselineColor || category);
  const prompt = useUnsavedChangesPrompt({
    section: "Etiquetas",
    dirty,
    busy: saving,
    save,
    discard: () => {
      setForm({ name: "", color: baselineColor });
      setFormError("");
    },
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await save();
    } catch (cause) {
      setFormError((cause as Error).message);
    }
  }

  function replaceTag(updated: PatientTag) {
    setTags((items) =>
      sortPatientTags(
        (items ?? []).map((item) => (item.id === updated.id ? updated : item)),
      ),
    );
  }

  async function remove(tag: PatientTag) {
    try {
      await api.deletePatientTag(tag.id);
    } catch (cause) {
      // Em uso (409): atualiza a contagem mostrada com a que a API devolveu.
      const count =
        cause instanceof ApiClientError
          ? cause.details?.patientCount
          : undefined;
      if (typeof count === "number")
        replaceTag({ ...tag, patientCount: count });
      throw new Error(
        cause instanceof ApiClientError
          ? cause.message
          : "Não foi possível excluir a etiqueta.",
        { cause },
      );
    }
    setTags((items) => (items ?? []).filter((item) => item.id !== tag.id));
    setDeleting(null);
    setNotice("Etiqueta excluída.");
  }

  return (
    <>
      <p className="muted-copy">
        Só as etiquetas daqui podem ser usadas no cadastro dos clientes, nos
        filtros e nos comunicados. Renomear atualiza os clientes que já têm a
        etiqueta.
      </p>
      {prompt.modal}
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      {error && (
        <>
          <ErrorBanner error={error} />
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </>
      )}
      {!tags ? (
        !error && <LoadingBlock />
      ) : (
        <>
          {canEdit && can("settings.tags_create") && (
            <form
              onChange={() => setNotice("")}
              className="form-grid tag-form"
              onSubmit={(event) => void submit(event)}
              noValidate
            >
              <fieldset className="settings-inline-fields" disabled={saving}>
                <legend>Cadastrar etiqueta</legend>
                <label className="span-2">
                  Nome da etiqueta
                  <input
                    maxLength={40}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </label>
                <TagCategorySelect value={category} onChange={setCategory} />
                <TagColorPicker
                  value={form.color}
                  previewName={form.name.trim() || "Nova etiqueta"}
                  onChange={(color) => setForm({ ...form, color })}
                />
                {formError && (
                  <div className="form-error span-2" role="alert">
                    {formError}
                  </div>
                )}
                <div className="modal-actions span-2">
                  {dirty && (
                    <span className="settings-dirty" role="status">
                      Alterações não salvas
                    </span>
                  )}
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!dirty}
                    onClick={() => {
                      setForm({ name: "", color: baselineColor });
                      setCategory("");
                      setFormError("");
                    }}
                  >
                    Descartar alterações
                  </button>
                  <button className="primary-button" disabled={saving}>
                    <Plus size={17} />
                    {saving ? "Adicionando…" : "Adicionar etiqueta"}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
          {tags.length === 0 ? (
            <EmptyState
              title="Nenhuma etiqueta configurada"
              copy={
                canEdit
                  ? "Crie as etiquetas que a equipe vai usar nos clientes."
                  : "Peça a quem administra as configurações para criar as etiquetas."
              }
            />
          ) : (
            <ul className="tag-list" aria-label="Etiquetas configuradas">
              {tags.map((tag) => (
                <li key={tag.id}>
                  <div className="tag-list-info">
                    <PatientTagBadge
                      name={tag.name}
                      color={patientTagDisplayColor(tag)}
                    />
                    {tag.category && (
                      <small className="tag-category">
                        {patientTagCategoryLabels[tag.category]}
                      </small>
                    )}
                    <small>
                      {countLabel(tag.patientCount, "cliente", "clientes")}
                    </small>
                  </div>
                  {canEdit && (
                    <div className="tag-list-actions">
                      {can("settings.tags_update") && (
                        <button
                          type="button"
                          className="secondary-button button-sm"
                          aria-label={`Editar ${withPrefix("etiqueta", tag.name)}`}
                          onClick={() => setEditing(tag)}
                        >
                          Editar
                        </button>
                      )}
                      {can("settings.tags_delete") && (
                        <button
                          type="button"
                          className="danger-button button-sm"
                          aria-label={`Excluir ${withPrefix("etiqueta", tag.name)}`}
                          onClick={() => setDeleting(tag)}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {editing && (
        <PatientTagEditModal
          tag={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            replaceTag(updated);
            setNotice("Etiqueta atualizada.");
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <ActionModal
          eyebrow="Etiquetas"
          title="Excluir etiqueta"
          subtitle={deleting.name}
          effect={
            deleting.patientCount > 0
              ? `A ${withQuotedPrefix("etiqueta", deleting.name)} está em ${countLabel(deleting.patientCount, "cliente", "clientes")}. Etiqueta em uso não pode ser excluída: retire-a desses clientes antes.`
              : `A ${withQuotedPrefix("etiqueta", deleting.name)} deixa de aparecer no cadastro dos clientes, nos filtros e nos comunicados.`
          }
          confirmLabel="Excluir etiqueta"
          danger
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
