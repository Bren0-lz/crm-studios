import { formatPhone, type Supplier } from "@crm/contracts";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { SupplierModal, type SupplierModalTab } from "./SupplierModal";
import { SupplierOrdersModal } from "./SupplierOrdersModal";
/**
 * `embedded` mostra a lista aberta em vez do bloco recolhível; `sales` usa a lista de
 * Vendas de produtos › Fornecedores, que não exige acesso ao Financeiro.
 */
export function SuppliersSection({
  embedded = false,
  sales = false,
}: {
  embedded?: boolean;
  sales?: boolean;
}) {
  const { can } = useAuthorization();
  // Cadastro pelo Financeiro ou pela aba Fornecedores de Vendas de produtos.
  const canManage =
    can("finance.suppliers_manage") || can("patients.suppliers_manage");
  const listSuppliers = () => (sales ? api.salesSuppliers() : api.suppliers());
  const [items, setItems] = useState<Supplier[] | null>(null),
    [opened, setOpened] = useState(embedded),
    [editor, setEditor] = useState<{
      supplier: Supplier | "new";
      tab?: SupplierModalTab;
    } | null>(null),
    [ordersOf, setOrdersOf] = useState<Supplier | null>(null),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      setItems(await listSuppliers());
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  useEffect(() => {
    if (!embedded) return;
    let alive = true;
    (sales ? api.salesSuppliers() : api.suppliers())
      .then((data) => alive && setItems(data))
      .catch((cause: Error) => alive && setError(cause.message));
    return () => {
      alive = false;
    };
  }, [embedded, sales]);
  const create = canManage && (
    <button
      className={embedded ? "secondary-button" : "primary-button"}
      onClick={() => setEditor({ supplier: "new" })}
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
              {can("finance.view") && (
                <button
                  className="secondary-button"
                  aria-label={`Pedidos de ${item.name}`}
                  onClick={() =>
                    // Quem edita registra pedidos no próprio cadastro; os demais só consultam.
                    can("finance.suppliers_manage")
                      ? setEditor({ supplier: item, tab: "pedidos" })
                      : setOrdersOf(item)
                  }
                >
                  Pedidos
                </button>
              )}
              {canManage && (
                <button
                  className="secondary-button"
                  onClick={() => setEditor({ supplier: item })}
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
      {ordersOf && (
        <SupplierOrdersModal
          supplier={ordersOf}
          onClose={() => setOrdersOf(null)}
        />
      )}
      {editor && (
        <SupplierModal
          supplier={editor.supplier}
          {...(editor.tab ? { initialTab: editor.tab } : {})}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}
    </section>
  );
}
