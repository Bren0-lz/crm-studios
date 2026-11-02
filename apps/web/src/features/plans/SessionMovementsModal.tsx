import {
  type PatientPlan,
  paymentMethodLabels,
  planHasSessionBalance,
  planUsedSessions,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { currency, shortDate } from "../../shared/lib/formatting";

export function SessionMovementsModal({
  plan,
  onClose,
}: {
  plan: PatientPlan;
  onClose: () => void;
}) {
  const [movements, setMovements] = useState<
    Awaited<ReturnType<typeof api.sessionMovements>>
  >([]);
  useEffect(() => {
    let active = true;
    api.sessionMovements(plan.id).then((data) => {
      if (active) setMovements(data);
    });
    return () => {
      active = false;
    };
  }, [plan.id]);
  return (
    <Modal
      title={`Extrato · ${plan.patientName}`}
      subtitle={
        planHasSessionBalance(plan)
          ? `${plan.remainingSessions} sessões disponíveis no momento.`
          : `${planUsedSessions(plan)} aulas feitas neste ciclo (plano prevê ${plan.totalSessions}).`
      }
      onClose={onClose}
    >
      {plan.services.map((entry) => (
        <p key={entry.serviceId}>
          {entry.serviceName}:{" "}
          {planHasSessionBalance(plan)
            ? `${entry.remainingSessions} de ${entry.totalSessions} sessões restantes`
            : `${planUsedSessions(entry)} de ${entry.totalSessions} aulas previstas`}
        </p>
      ))}
      {plan.status === "cancelled" && plan.cancelledAt && (
        <div className="plan-refund-summary">
          <p>
            Plano cancelado em {shortDate.format(new Date(plan.cancelledAt))}.
          </p>
          {plan.refundedInCents ? (
            <p>
              Valor estornado ao cliente:{" "}
              <strong>{currency.format(plan.refundedInCents / 100)}</strong>
              {plan.refundPaymentMethod
                ? ` · ${paymentMethodLabels[plan.refundPaymentMethod]}`
                : ""}
              {plan.refundNote ? ` · ${plan.refundNote}` : ""}
            </p>
          ) : (
            <p>Sem estorno ao cliente.</p>
          )}
        </div>
      )}
      <div className="movement-list">
        {movements.length === 0 ? (
          <LoadingBlock />
        ) : (
          movements.map((movement) => (
            <div key={movement.id}>
              <span
                className={
                  movement.quantity > 0 ? "movement-credit" : "movement-debit"
                }
              >
                {movement.quantity > 0 ? "+" : ""}
                {movement.quantity}
              </span>
              <div>
                <strong>
                  {movement.reason} · {movement.serviceName}
                </strong>
                <small>
                  {new Date(movement.createdAt).toLocaleString("pt-BR")}
                </small>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
