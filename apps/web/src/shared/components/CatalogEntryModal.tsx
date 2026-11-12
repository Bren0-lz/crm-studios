import {
  clinicCatalogLabels,
  type ClinicCatalogEntry,
  type ClinicCatalogKind,
} from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useToast } from "../feedback/toast-context";
import { sizesWithDraft } from "../lib/product-sizes";
import { useFormDirty } from "../workflows/useDirtyGuard";
import { ErrorBanner } from "./ErrorBanner";
import { Modal, ModalCancelButton } from "./Modal";
import { ProductSizesEditor } from "./ProductSizesEditor";

/**
 * Inclui ou edita um item de um cadastro compartilhado (Configurações › Cadastros). Usado na
 * própria lista de cadastros e, por cima de outro formulário, para cadastrar sem sair dele
 * (ex.: "Cadastrar origem" no novo lead).
 */
export function CatalogEntryModal({
  kind,
  item,
  title,
  onClose,
  onSaved,
}: {
  kind: ClinicCatalogKind;
  /** Item em edição; sem ele, cadastra um novo. */
  item?: ClinicCatalogEntry | undefined;
  title?: string | undefined;
  onClose: () => void;
  onSaved: (entry: ClinicCatalogEntry) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(item?.name ?? "");
  const [active, setActive] = useState(item?.active ?? true);
  const [hasSizes, setHasSizes] = useState(Boolean(item?.sizes.length));
  const [sizes, setSizes] = useState<string[]>(item?.sizes ?? []);
  const [sizeDraft, setSizeDraft] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useFormDirty(
    { name, active, hasSizes, sizes, sizeDraft },
    true,
  );
  const withSizes = kind === "product_category";
  async function save(event: FormEvent) {
    event.preventDefault();
    // O formulário pode estar por cima de outro: o envio não sobe até o de baixo.
    event.stopPropagation();
    const finalSizes = hasSizes ? sizesWithDraft(sizes, sizeDraft) : [];
    if (withSizes && hasSizes && !finalSizes.length) {
      setError("Adicione ao menos um tamanho ou desmarque a opção.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const entry = await api.saveClinicCatalog(
        kind,
        { name, active, ...(withSizes ? { sizes: finalSizes } : {}) },
        item?.id,
      );
      toast.success(item ? "Item atualizado." : "Item cadastrado.");
      onSaved(entry);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      title={title ?? (item ? "Editar cadastro" : "Novo cadastro")}
      subtitle={clinicCatalogLabels[kind]}
      busy={saving}
      dirty={dirty}
      onClose={onClose}
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
        {withSizes && item && hasSizes && (
          <p className="field-hint">
            Os produtos já cadastrados mantêm os tamanhos que têm; um tamanho
            novo aparece para marcar ao editar o produto.
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
  );
}
