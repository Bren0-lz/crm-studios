import {
  clinicCatalogLabels,
  type ClinicCatalogEntry,
  type ClinicCatalogKind,
} from "@crm/contracts";
import { Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useToast } from "../../shared/feedback/toast-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

const kindHints: Partial<Record<ClinicCatalogKind, string>> = {
  product_category: "Agrupam os produtos do estoque.",
  product_brand: "Fabricantes dos produtos vendidos ou usados na clínica.",
  muscle_group: "Usados nos exercícios e nas evoluções clínicas.",
  lead_source: "De onde vêm os contatos comerciais.",
  lead_channel: "Como o contato chegou à clínica.",
  lead_lost_reason: "Por que um contato não virou cliente.",
};

/** Lista de um cadastro compartilhado (só administradores incluem e editam). */
export function CatalogSection({ kind }: { kind: ClinicCatalogKind }) {
  const { user } = useAuthorization();
  const toast = useToast();
  const [items, setItems] = useState<ClinicCatalogEntry[] | null>(null);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<ClinicCatalogEntry | "new" | null>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty({ name, active }, Boolean(editor));
  const label = clinicCatalogLabels[kind];
  const admin = user?.role === "admin";
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
    setError("");
    setEditor(item);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.saveClinicCatalog(
        kind,
        { name, active },
        editor && editor !== "new" ? editor.id : undefined,
      );
      toast.success(
        editor && editor !== "new" ? "Item atualizado." : "Item cadastrado.",
      );
      setItems(await api.clinicCatalog(kind));
      setEditor(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const activeCount = items?.filter((item) => item.active).length ?? 0;
  return (
    <section className="catalog-section" aria-label={label}>
      <header className="catalog-section-head">
        <div>
          <h3>{label}</h3>
          <p>
            {kindHints[kind]}
            {items?.length
              ? ` · ${activeCount} ${activeCount === 1 ? "ativo" : "ativos"} de ${items.length}`
              : ""}
          </p>
        </div>
        {admin && (
          <button
            className="secondary-button"
            aria-label={`Adicionar em ${label}`}
            onClick={() => open("new")}
          >
            <Plus size={16} aria-hidden="true" />
            Adicionar
          </button>
        )}
      </header>
      {error && !editor && <ErrorBanner error={error} />}
      {!items ? (
        !error && <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum cadastro"
          copy="Adicione o primeiro item desta lista."
        />
      ) : (
        <ul className="catalog-list">
          {items.map((item) => (
            <li className="table-row catalog-row" key={item.id}>
              <strong>
                {item.parentId && (
                  <span className="catalog-parent">
                    {items.find((parent) => parent.id === item.parentId)
                      ?.name ?? "Categoria"}{" "}
                    /{" "}
                  </span>
                )}
                {item.name}
              </strong>
              <span
                className={
                  item.active ? "status-pill confirmed" : "status-pill"
                }
              >
                {item.active ? "Ativo" : "Inativo"}
              </span>
              {admin && (
                <button className="text-button" onClick={() => open(item)}>
                  Editar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editor && (
        <Modal
          title={editor === "new" ? "Novo cadastro" : "Editar cadastro"}
          subtitle={label}
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
    </section>
  );
}
