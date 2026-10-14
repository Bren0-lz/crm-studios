import type { Supplier, SupplierInput } from "@crm/contracts";
import { useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
export function SuppliersSection() {
  const { can } = useAuthorization();
  const [items, setItems] = useState<Supplier[] | null>(null),
    [opened, setOpened] = useState(false),
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
  return (
    <section className="panel">
      <details
        onToggle={(event) => {
          if (event.currentTarget.open && !opened) {
            setOpened(true);
            void load();
          }
        }}
      >
        <summary className="panel-head">Fornecedores</summary>
        {opened && (
          <div className="inventory-body">
            {error && <ErrorBanner error={error} />}
            {can("finance.suppliers_manage") && (
              <button className="primary-button" onClick={() => edit("new")}>
                Novo fornecedor
              </button>
            )}
            {!items ? (
              !error && <LoadingBlock />
            ) : !items.length ? (
              <EmptyState
                title="Nenhum fornecedor"
                copy="Cadastre as pessoas e empresas utilizadas nas despesas."
              />
            ) : (
              items.map((item) => (
                <div className="table-row" key={item.id}>
                  <strong>{item.name}</strong>
                  <span>
                    {item.kind === "company"
                      ? "Pessoa jurídica"
                      : "Pessoa física"}{" "}
                    · {item.active ? "Ativo" : "Inativo"}
                  </span>
                  {can("finance.suppliers_manage") && (
                    <button
                      className="secondary-button"
                      onClick={() => edit(item)}
                    >
                      Editar
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </details>
      {editor && (
        <Modal
          title={editor === "new" ? "Novo fornecedor" : "Editar fornecedor"}
          subtitle="Desativar mantém os vínculos e o histórico das despesas."
          busy={busy}
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
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Cancelar
              </button>
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
