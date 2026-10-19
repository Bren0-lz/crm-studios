import { ClinicalResourcesPanel } from "../clinical/index";
import { SuppliersSection } from "../finance/index";
import {
  clinicCatalogLabels,
  type ClinicCatalogEntry,
  type ClinicCatalogKind,
} from "@crm/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

export function ClinicCatalogsContent() {
  const { user, can } = useAuthorization();
  const [kind, setKind] = useState<ClinicCatalogKind>("interest");
  const [items, setItems] = useState<ClinicCatalogEntry[] | null>(null);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<ClinicCatalogEntry | "new" | null>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty({ name, active, parentId }, Boolean(editor));
  useEffect(() => {
    let alive = true;
    api
      .clinicCatalog(kind)
      .then((data) => {
        if (alive) setItems(data);
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [kind]);
  function open(item: ClinicCatalogEntry | "new") {
    setName(item === "new" ? "" : item.name);
    setActive(item === "new" ? true : item.active);
    setParentId(item === "new" ? "" : (item.parentId ?? ""));
    setEditor(item);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.saveClinicCatalog(
        kind,
        {
          name,
          active,
          ...(kind === "product_category"
            ? { parentId: parentId || null }
            : {}),
        },
        editor && editor !== "new" ? editor.id : undefined,
      );
      setItems(await api.clinicCatalog(kind));
      setEditor(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="settings-panel-body">
      <div className="list-toolbar">
        <label>
          Cadastro
          <select
            value={kind}
            onChange={(event) => (
              setKind(event.target.value as ClinicCatalogKind),
              setItems(null),
              setError("")
            )}
          >
            {Object.entries(clinicCatalogLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {user?.role === "admin" && (
          <button className="primary-button" onClick={() => open("new")}>
            Novo cadastro
          </button>
        )}
      </div>
      {error && <ErrorBanner error={error} />}
      {!items ? (
        !error && <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum cadastro"
          copy="Adicione os itens utilizados pela clínica."
        />
      ) : (
        items.map((item) => (
          <div className="table-row" key={item.id}>
            <strong>
              {item.parentId
                ? `${items.find((parent) => parent.id === item.parentId)?.name ?? "Categoria"} / `
                : ""}
              {item.name}
            </strong>
            <span>{item.active ? "Ativo" : "Inativo"}</span>
            {user?.role === "admin" && (
              <button className="secondary-button" onClick={() => open(item)}>
                Editar
              </button>
            )}
          </div>
        ))
      )}
      {editor && (
        <Modal
          title={editor === "new" ? "Novo cadastro" : "Editar cadastro"}
          subtitle={clinicCatalogLabels[kind]}
          busy={saving}
          dirty={dirty}
          onClose={() => setEditor(null)}
        >
          <form className="clinical-form" onSubmit={save}>
            {error && <ErrorBanner error={error} />}
            <label>
              Nome
              <input
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {kind === "product_category" && (
              <label>
                Categoria principal
                <select
                  value={parentId}
                  onChange={(event) => setParentId(event.target.value)}
                  disabled={items?.some(
                    (item) => editor !== "new" && item.parentId === editor.id,
                  )}
                >
                  <option value="">Categoria principal (sem vínculo)</option>
                  {items
                    ?.filter(
                      (item) =>
                        !item.parentId &&
                        (item.active || item.id === parentId) &&
                        (editor === "new" || item.id !== editor.id),
                    )
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              Ativo
            </label>
            <div className="modal-actions">
              <ModalCancelButton disabled={saving}>Cancelar</ModalCancelButton>
              <button className="primary-button" disabled={saving}>
                Salvar
              </button>
            </div>
          </form>
        </Modal>
      )}
      {can("finance.view") && <SuppliersSection />}
      {can("clinical.view") && (
        <ClinicalResourcesPanel patientId="" patients={[]} catalogOnly />
      )}
    </div>
  );
}
