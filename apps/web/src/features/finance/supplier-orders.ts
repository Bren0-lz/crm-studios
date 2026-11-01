import type { SupplierOrder } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { currency } from "../../shared/lib/formatting";

/** Pedidos do fornecedor; `version` muda para recarregar depois de um pedido novo. */
export function useSupplierOrders(supplierId: string | null, version = 0) {
  const [orders, setOrders] = useState<SupplierOrder[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!supplierId) return;
    let alive = true;
    api
      .supplierOrders(supplierId)
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
  }, [supplierId, version]);
  return { orders, error };
}

/** Resumo "N pedidos · R$ total" do histórico. */
export function supplierOrdersSummary(orders: SupplierOrder[] | null) {
  if (!orders?.length) return "";
  const total = orders.reduce((sum, order) => sum + order.totalInCents, 0);
  return `${orders.length === 1 ? "1 pedido" : `${orders.length} pedidos`} · ${currency.format(total / 100)}`;
}
