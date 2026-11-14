import type { SaleMovement, SaleType } from "@crm/contracts";
import { saleTypeOf } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import {
  clinicIsoDate,
  currency,
  formatIsoDate,
} from "../../shared/lib/formatting";

const sourceLabels: Record<SaleType, string> = {
  plan: "Plano",
  single: "Plano avulso",
  product: "Produto",
  service: "Serviço (comanda antiga)",
};

/** Tudo o que o cliente já contratou: planos, produtos e serviços de comandas antigas (com estornos). */
export function PatientSalesHistoryModal({
  patientId,
  patientName,
  onClose,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
}) {
  const [sales, setSales] = useState<SaleMovement[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api
      .patientSalesHistory(patientId)
      .then((data) => {
        if (active) setSales(data);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [patientId]);
  return (
    <Modal
      eyebrow="Relatórios"
      title="Histórico de contratações"
      subtitle={patientName}
      wide
      onClose={onClose}
    >
      {error && <ErrorBanner error={error} />}
      {!sales && !error && <LoadingBlock />}
      {sales &&
        (!sales.length ? (
          <EmptyState
            title="Nenhuma contratação registrada."
            copy="Planos, serviços e produtos vendidos para este cliente aparecem aqui."
          />
        ) : (
          <div className="table-scroll">
            {/* RV6: no celular cada linha vira um cartão (rótulo + valor), sem rolagem lateral. */}
            <table className="dre-table contracted-history-table">
              <caption>Serviços contratados por {patientName}</caption>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Item</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Movimento</th>
                  <th scope="col" className="numeric-value">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody>
                {sales.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Data">
                      {formatIsoDate(clinicIsoDate(item.occurredAt))}
                    </td>
                    <th scope="row">
                      {item.itemName}
                      {item.quantity > 1 && (
                        <small className="reports-cell-detail">
                          {item.quantity} unidades
                        </small>
                      )}
                    </th>
                    <td data-label="Tipo">{sourceLabels[saleTypeOf(item)]}</td>
                    <td data-label="Movimento">
                      {item.kind === "sale" ? "Venda" : "Cancelamento"}
                    </td>
                    <td className="numeric-value" data-label="Valor">
                      {currency.format(item.amountInCents / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </Modal>
  );
}
