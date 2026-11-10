import type { ClinicCatalogEntry } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { ProductSizesEditor } from "../../shared/components/ProductSizesEditor";
import { sizesWithDraft } from "../../shared/lib/product-sizes";
import { useToast } from "../../shared/feedback/toast-context";

export type ProductCatalogKind = "product_category" | "product_brand";

const copy: Record<
  ProductCatalogKind,
  { title: string; subtitle: string; saved: string }
> = {
  product_category: {
    title: "Nova categoria",
    subtitle: "A categoria fica disponível para todos os produtos.",
    saved: "Categoria cadastrada.",
  },
  product_brand: {
    title: "Nova marca",
    subtitle: "A marca fica disponível para todos os produtos.",
    saved: "Marca cadastrada.",
  },
};

/** Cadastro rápido de categoria ou marca aberto por cima do formulário do produto. */
export function NewCatalogEntryModal({
  kind,
  onClose,
  onCreated,
}: {
  kind: ProductCatalogKind;
  onClose: () => void;
  onCreated: (entry: ClinicCatalogEntry) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [hasSizes, setHasSizes] = useState(false);
  const [sizes, setSizes] = useState<string[]>([]);
  const [sizeDraft, setSizeDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const withSizes = kind === "product_category";
  async function save(event: FormEvent) {
    event.preventDefault();
    const finalSizes = hasSizes ? sizesWithDraft(sizes, sizeDraft) : [];
    if (withSizes && hasSizes && !finalSizes.length) {
      setError("Adicione ao menos um tamanho ou desmarque a opção.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const entry = await api.saveClinicCatalog(kind, {
        name,
        active: true,
        ...(withSizes ? { sizes: finalSizes } : {}),
      });
      toast.success(copy[kind].saved);
      onCreated(entry);
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal
      title={copy[kind].title}
      subtitle={copy[kind].subtitle}
      busy={busy}
      dirty={Boolean(name.trim() || hasSizes)}
      onClose={onClose}
    >
      <form className="clinical-form" onSubmit={save}>
        {error && <p className="form-error">{error}</p>}
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
        <div className="modal-actions">
          <ModalCancelButton disabled={busy}>Voltar</ModalCancelButton>
          <button className="primary-button" disabled={busy}>
            {busy ? "Salvando…" : "Cadastrar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
