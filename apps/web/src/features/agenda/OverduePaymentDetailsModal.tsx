import type { Receivable } from "@crm/contracts";
import { receivableDisplayInstallment } from "@crm/contracts";
import { ArrowUpRight, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { allBranches, api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import {
  currency,
  formatIsoDate,
  localIsoDate,
} from "../../shared/lib/formatting";

function daysLate(dueDate: string, today: string) {
  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) /
      86_400_000,
  );
  return days === 1 ? "1 dia de atraso" : `${days} dias de atraso`;
}

/** Parcelas vencidas e em aberto do cliente, abertas pelo aviso "Pagamento atrasado". */
export function OverduePaymentDetailsModal({
  patientId,
  patientName,
  onClose,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<{
    items: Receivable[] | null;
    error: string;
  }>({ items: null, error: "" });
  const today = localIsoDate();
  useEffect(() => {
    let active = true;
    api
      .financialSummary(allBranches)
      .then(
        (summary) =>
          active &&
          setState({
            items: summary.receivables
              .filter(
                // `overdue` vem da API (fuso da clínica), mesma regra da etiqueta.
                (item) =>
                  item.patientId === patientId &&
                  item.status === "open" &&
                  item.overdue,
              )
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
            error: "",
          }),
      )
      .catch(
        (cause: Error) =>
          active && setState({ items: null, error: cause.message }),
      );
    return () => {
      active = false;
    };
  }, [patientId]);
  const total = (state.items ?? []).reduce(
    (sum, item) => sum + item.amountInCents,
    0,
  );
  return (
    <Modal
      eyebrow="Financeiro"
      title="Pagamento atrasado"
      subtitle={`Parcelas vencidas e em aberto de ${patientName}.`}
      onClose={onClose}
    >
      <div className="overdue-details">
        {state.error ? (
          <ErrorBanner error={state.error} />
        ) : !state.items ? (
          <LoadingBlock />
        ) : state.items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nenhuma parcela vencida"
            copy="As parcelas deste cliente estão em dia. A etiqueta some na próxima atualização."
          />
        ) : (
          <>
            <ul className="patient-tab-items">
              {state.items.map((item) => (
                <li key={item.id}>
                  <div className="patient-tab-item-main">
                    <strong>{item.description}</strong>
                    <span>
                      {item.installmentCount > 1
                        ? `Parcela ${receivableDisplayInstallment(item)} de ${item.installmentCount} · `
                        : ""}
                      Venceu em {formatIsoDate(item.dueDate)} ·{" "}
                      {daysLate(item.dueDate, today)}
                    </span>
                  </div>
                  <div className="patient-tab-item-side">
                    <span className="patient-tab-amount">
                      {currency.format(item.amountInCents / 100)}
                    </span>
                    <span className="status-pill overdue">Vencida</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="overdue-details-total">
              <span>Total em atraso</span>
              <strong>{currency.format(total / 100)}</strong>
            </p>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Voltar
          </button>
          <a
            className="primary-button"
            href={`/financeiro?patientId=${encodeURIComponent(patientId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ArrowUpRight size={16} aria-hidden="true" />
            Abrir no Financeiro
          </a>
        </div>
      </div>
    </Modal>
  );
}
