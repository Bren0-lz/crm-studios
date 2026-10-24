import type { Supplier, SupplierInput } from "@crm/contracts";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useToast } from "../../shared/feedback/toast-context";
import { useAuthorization } from "../../authorization-context";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
/** `embedded` mostra a lista aberta (sub-aba de Cadastros) em vez do bloco recolhível. */
export function SuppliersSection({ embedded = false }: { embedded?: boolean }) {
  const { can } = useAuthorization();
  const toast = useToast();
  const [items, setItems] = useState<Supplier[] | null>(null),
    [opened, setOpened] = useState(embedded),
    [editor, setEditor] = useState<Supplier | "new" | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState<SupplierInput>({
      name: "",
      kind: "company",
      document: "",
      phone: "",
      email: "",
      notes: "",
      active: true,
    });
  const dirty = useFormDirty(form, Boolean(editor));
  async function load() {
    setError("");
    try {
      setItems(await api.suppliers());
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function edit(item: Supplier | "new") {
    setForm(
      item === "new"
        ? {
            name: "",
            kind: "company",
            document: "",
            phone: "",
            email: "",
            notes: "",
            active: true,
          }
        : item,
    );
    setEditor(item);
  }
  useEffect(() => {
    if (!embedded) return;
    let alive = true;
    api
      .suppliers()
      .then((data) => alive && setItems(data))
      .catch((cause: Error) => alive && setError(cause.message));
    return () => {
      alive = false;
    };
  }, [embedded]);
  const create = can("finance.suppliers_manage") && (
    <button
      className={embedded ? "secondary-button" : "primary-button"}
      onClick={() => edit("new")}
    >
      {embedded && <Plus size={16} aria-hidden="true" />}
      Novo fornecedor
    </button>
  );
  const list = (
    <>
      {error && <ErrorBanner error={error} />}
      {!embedded && create}
      {!items ? (
        !error && <LoadingBlock />
      ) : !items.length ? (
        <EmptyState
          title="Nenhum fornecedor"
          copy="Cadastre as pessoas e empresas utilizadas nas despesas."
        />
      ) : (
        <div className={embedded ? "catalog-list" : undefined}>
          {items.map((item) => (
            <div
              className={embedded ? "table-row catalog-row" : "table-row"}
              key={item.id}
            >
              <strong>{item.name}</strong>
              <span>
                {item.kind === "company" ? "Pessoa jurídica" : "Pessoa física"}{" "}
                · {item.active ? "Ativo" : "Inativo"}
              </span>
              {can("finance.suppliers_manage") && (
                <button className="secondary-button" onClick={() => edit(item)}>
                  Editar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
  return (
    <section className={embedded ? "catalog-section" : "panel"}>
      {embedded ? (
        <>
          <header className="catalog-section-head">
            <div>
              <h3>Fornecedores</h3>
              <p>Pessoas e empresas vinculadas às despesas.</p>
            </div>
            {create}
          </header>
          {list}
        </>
      ) : (
        <details
          onToggle={(event) => {
            if (event.currentTarget.open && !opened) {
              setOpened(true);
              void load();
            }
          }}
        >
          <summary className="panel-head">Fornecedores</summary>
          {opened && <div className="inventory-body">{list}</div>}
        </details>
      )}
      {editor && (
        <Modal
          title={editor === "new" ? "Novo fornecedor" : "Editar fornecedor"}
          subtitle="Desativar mantém os vínculos e o histórico das despesas."
          busy={busy}
          dirty={dirty}
          onClose={() => setEditor(null)}
        >
          <form
            className="clinical-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api.saveSupplier(
                  form,
                  editor !== "new" ? editor.id : undefined,
                );
                toast.success(
                  editor === "new"
                    ? "Fornecedor cadastrado."
                    : "Fornecedor atualizado.",
                );
                await load();
                setEditor(null);
              } catch (cause) {
                setError((cause as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && <ErrorBanner error={error} />}
            <fieldset className="form-fields form-grid" disabled={busy}>
              <label>
                Nome
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </label>
              <label>
                Tipo
                <select
                  value={form.kind}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      kind: event.target.value as SupplierInput["kind"],
                    })
                  }
                >
                  <option value="company">Pessoa jurídica</option>
                  <option value="person">Pessoa física</option>
                </select>
              </label>
              <label>
                CPF / CNPJ
                <input
                  value={form.document}
                  maxLength={30}
                  onChange={(event) =>
                    setForm({ ...form, document: event.target.value })
                  }
                />
              </label>
              <label>
                Telefone
                <input
                  value={form.phone}
                  maxLength={30}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  value={form.email ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                />
              </label>
              <label>
                Observações
                <textarea
                  value={form.notes}
                  maxLength={1000}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm({ ...form, active: event.target.checked })
                  }
                />
                Ativo
              </label>
            </fieldset>
            <div className="modal-actions">
              <ModalCancelButton disabled={busy}>Cancelar</ModalCancelButton>
              <button className="primary-button" disabled={busy}>
                Salvar fornecedor
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
