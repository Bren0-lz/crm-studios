import { type PatientPlan, paymentMethodLabels } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { currency, sentence, shortDate } from "../../shared/lib/formatting";

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
  const cancelled = plan.status === "cancelled";
  return (
    <Modal
      title={`Extrato · ${plan.patientName}`}
      subtitle={
        cancelled
          ? "Plano cancelado – sessões indisponíveis."
          : `${plan.remainingSessions} sessões disponíveis no momento.`
      }
      onClose={onClose}
    >
      {plan.services.map((entry) => (
        <p key={entry.serviceId}>
          {/* Plano cancelado não tem sessão utilizável, mesmo com saldo gravado. */}
          {entry.serviceName}: {cancelled ? 0 : entry.remainingSessions} de{" "}
          {entry.totalSessions} sessões{" "}
          {cancelled ? "disponíveis" : "restantes"}
        </p>
      ))}
      {cancelled && plan.cancelledAt && (
        <div className="plan-refund-summary">
          <p>
            {sentence(
              `Plano cancelado em ${shortDate.format(new Date(plan.cancelledAt))}`,
            )}
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
