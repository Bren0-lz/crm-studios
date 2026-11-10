import {
  productSizeLabel,
  type Supplier,
  type SupplierOrder,
} from "@crm/contracts";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { supplierOrdersSummary, useSupplierOrders } from "./supplier-orders";
import { currency, formatIsoDate } from "../../shared/lib/formatting";

function itemLabel(item: SupplierOrder["items"][number]) {
  const name = item.size
    ? `${item.productName} · ${productSizeLabel(item.size)}`
    : item.productName;
  return `${item.quantity}× ${name}`;
}

/** Tabela com data, número, itens e valor de cada pedido feito ao fornecedor. */
export function SupplierOrderHistory({
  orders,
  error,
}: {
  orders: SupplierOrder[] | null;
  error: string;
}) {
  return (
    <>
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
    </>
  );
}

/**
 * Histórico de pedidos só para consulta (quem não edita fornecedores). Quem edita abre o
 * cadastro do fornecedor direto na aba Pedidos, onde também registra pedidos novos.
 */
export function SupplierOrdersModal({
  supplier,
  onClose,
}: {
  supplier: Supplier;
  onClose: () => void;
}) {
  const { orders, error } = useSupplierOrders(supplier.id);
  return (
    <Modal
      title={`Pedidos de ${supplier.name}`}
      subtitle="Valor e itens de cada pedido feito ao fornecedor."
      wide
      onClose={onClose}
    >
      <div className="supplier-orders">
        {orders?.length ? (
          <p className="panel-context">{supplierOrdersSummary(orders)}</p>
        ) : null}
        <SupplierOrderHistory orders={orders} error={error} />
      </div>
    </Modal>
  );
}
