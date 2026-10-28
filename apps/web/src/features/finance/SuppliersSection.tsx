import { formatPhone, type Supplier } from "@crm/contracts";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { SupplierModal } from "./SupplierModal";
/** `embedded` mostra a lista aberta (sub-aba de Cadastros) em vez do bloco recolhível. */
export function SuppliersSection({ embedded = false }: { embedded?: boolean }) {
  const { can } = useAuthorization();
  const [items, setItems] = useState<Supplier[] | null>(null),
    [opened, setOpened] = useState(embedded),
    [editor, setEditor] = useState<Supplier | "new" | null>(null),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      setItems(await api.suppliers());
    } catch (cause) {
      setError((cause as Error).message);
    }
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
      onClick={() => setEditor("new")}
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
                {(item.whatsapp || item.phone) &&
                  ` · ${formatPhone(item.whatsapp || item.phone)}`}
              </span>
              {can("finance.suppliers_manage") && (
                <button
                  className="secondary-button"
                  onClick={() => setEditor(item)}
                >
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
        <SupplierModal
          supplier={editor}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}
    </section>
  );
}
