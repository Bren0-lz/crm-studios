import {
  productSizeLabels,
  type Supplier,
  type SupplierOrder,
} from "@crm/contracts";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { currency, formatIsoDate } from "../../shared/lib/formatting";
import { SupplierOrderModal } from "./SupplierOrderModal";

function itemLabel(item: SupplierOrder["items"][number]) {
  const name = item.size
    ? `${item.productName} · ${productSizeLabels[item.size]}`
    : item.productName;
  return `${item.quantity}× ${name}`;
}

/** Histórico de pedidos feitos ao fornecedor, com o atalho para registrar um novo. */
export function SupplierOrdersModal({
  supplier,
  onClose,
}: {
  supplier: Supplier;
  onClose: () => void;
}) {
  const { can } = useAuthorization();
  const [orders, setOrders] = useState<SupplierOrder[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    api
      .supplierOrders(supplier.id)
      .then((data) => {
        if (alive) {
          setOrders(data);
          setError("");
        }
      })
      .catch((cause: Error) => {
        if (alive) setError(cause.message);
      });
    return () => {
      alive = false;
    };
  }, [supplier.id, version]);
  const totalInCents =
    orders?.reduce((sum, order) => sum + order.totalInCents, 0) ?? 0;
  return (
    <>
      <Modal
        title={`Pedidos de ${supplier.name}`}
        subtitle="Valor e itens de cada pedido feito ao fornecedor."
        wide
        inactive={creating}
        onClose={onClose}
      >
        <div className="supplier-orders">
          <div className="supplier-orders-head">
            <p className="panel-context">
              {orders?.length
                ? `${orders.length === 1 ? "1 pedido" : `${orders.length} pedidos`} · ${currency.format(totalInCents / 100)}`
                : ""}
            </p>
            {can("finance.suppliers_manage") && (
              <button
                type="button"
                className="primary-button"
                onClick={() => setCreating(true)}
              >
                <Plus size={16} aria-hidden="true" /> Novo pedido
              </button>
            )}
          </div>
          {error && <ErrorBanner error={error} />}
          {!orders ? (
            !error && <LoadingBlock />
          ) : !orders.length ? (
            <EmptyState
              title="Nenhum pedido"
              copy="Registre os pedidos feitos a este fornecedor para manter o histórico de compras."
            />
          ) : (
            <div className="table-scroll">
              <table className="dre-table">
                <caption className="sr-only">Pedidos do fornecedor</caption>
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Nº</th>
                    <th scope="col">Itens</th>
                    <th scope="col" className="numeric-value">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>{formatIsoDate(order.orderedOn)}</td>
                      <td>{order.number || "—"}</td>
                      <th scope="row" className="supplier-order-items">
                        <ul>
                          {order.items.map((item) => (
                            <li key={item.id}>
                              {itemLabel(item)}
                              {item.createdProduct && (
                                <span className="status-pill">Novo</span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {order.notes && <small>{order.notes}</small>}
                      </th>
                      <td className="numeric-value">
                        {currency.format(order.totalInCents / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
      {creating && (
        <SupplierOrderModal
          supplier={supplier}
          onClose={() => setCreating(false)}
          onSaved={() => setVersion((current) => current + 1)}
        />
      )}
    </>
  );
}
