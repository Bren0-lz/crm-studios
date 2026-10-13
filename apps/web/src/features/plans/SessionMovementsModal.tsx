import type { PatientPlan } from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";

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
      subtitle={`${plan.remainingSessions} sessões disponíveis no momento.`}
      onClose={onClose}
    >
      {plan.services.map((entry) => (
        <p key={entry.serviceId}>
          {entry.serviceName}: {entry.remainingSessions} de{" "}
          {entry.totalSessions} sessões restantes
        </p>
      ))}
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
