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
import { ProductSizesEditor } from "../../shared/components/ProductSizesEditor";
import { sizesWithDraft } from "../../shared/lib/product-sizes";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";

const kindHints: Partial<Record<ClinicCatalogKind, string>> = {
  product_category: "Agrupam os produtos do estoque.",
  product_brand: "Fabricantes dos produtos vendidos ou usados na clínica.",
  muscle_group: "Usados nos exercícios e treinos.",
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
  const [hasSizes, setHasSizes] = useState(false);
  const [sizes, setSizes] = useState<string[]>([]);
  const [sizeDraft, setSizeDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty(
    { name, active, hasSizes, sizes, sizeDraft },
    Boolean(editor),
  );
  const withSizes = kind === "product_category";
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
    setHasSizes(item !== "new" && item.sizes.length > 0);
    setSizes(item === "new" ? [] : item.sizes);
    setSizeDraft("");
    setError("");
    setEditor(item);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const finalSizes = hasSizes ? sizesWithDraft(sizes, sizeDraft) : [];
    if (withSizes && hasSizes && !finalSizes.length) {
      setError("Adicione ao menos um tamanho ou desmarque a opção.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.saveClinicCatalog(
        kind,
        { name, active, ...(withSizes ? { sizes: finalSizes } : {}) },
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
                {item.sizes.length > 0 && (
                  <span className="catalog-parent">
                    {` · Tamanhos: ${item.sizes.join(", ")}`}
                  </span>
                )}
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
            {withSizes && (
              <ProductSizesEditor
                enabled={hasSizes}
                sizes={sizes}
                draft={sizeDraft}
                onEnabledChange={setHasSizes}
                onSizesChange={(next) => {
                  setSizes(next);
                  setError("");
                }}
                onDraftChange={setSizeDraft}
              />
            )}
            {withSizes && editor !== "new" && hasSizes && (
              <p className="field-hint">
                Os produtos já cadastrados mantêm os tamanhos que têm; um
                tamanho novo aparece para marcar ao editar o produto.
              </p>
            )}
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
