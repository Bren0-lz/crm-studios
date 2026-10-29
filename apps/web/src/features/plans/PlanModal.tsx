import { useAuthorization } from "../../authorization-context";
import {
  PlanPurchaseOptions,
  type PurchaseOptions,
} from "./PlanPurchaseOptions";
import type { CloseGuard } from "../../shared/workflows/types";
import { useState, useCallback, useRef } from "react";
import { api } from "../../api";
import { Modal } from "../../shared/components/Modal";
import { PlanForm } from "./PlanForm";
import type { PlanModalProps } from "./types";

export function PlanModal({
  patients,
  services,
  renewing,
  fixedPatient,
  onClose,
  onSaved,
}: PlanModalProps) {
  const { can } = useAuthorization();
  const [busy, setBusy] = useState(false);
  const [nested, setNested] = useState(false);
  const [options, setOptions] = useState<PurchaseOptions>({ appointments: [] });
  const closeGuard = useRef<CloseGuard | null>(null);
  const registerCloseGuard = useCallback((guard: CloseGuard) => {
    closeGuard.current = guard;
    return () => {
      if (closeGuard.current === guard) closeGuard.current = null;
    };
  }, []);
  const close = () =>
    closeGuard.current ? closeGuard.current(onClose) : onClose();
  const [purchaseKey] = useState(() => crypto.randomUUID());
  return (
    <Modal
      title={renewing ? "Renovar plano" : "Novo plano"}
      subtitle={
        renewing
          ? `${renewing.patientName} · ${renewing.serviceName}. O novo período recebe saldo e parcelas próprios; as sessões restantes do plano atual não são transferidas.`
          : "O saldo e as contas a receber serão criados na mesma operação."
      }
      busy={busy}
      inactive={nested}
      onClose={close}
    >
      <PlanForm
        patients={patients}
        services={services}
        renewing={renewing}
        fixedPatient={fixedPatient}
        onCancel={onClose}
        registerCloseGuard={registerCloseGuard}
        additionalDirty={Boolean(
          options.groupId || options.document || options.appointments.length,
        )}
        onBusyChange={setBusy}
        renderAdditional={
          !renewing && can("plans.purchase")
            ? (input) => (
                <PlanPurchaseOptions
                  plan={input}
                  patients={patients}
                  services={services}
                  value={options}
                  onChange={setOptions}
                  onNestedChange={setNested}
                />
              )
            : undefined
        }
        onSubmit={async (input) => {
          const plan = renewing
            ? await api.renewPlan(renewing.id, {
                name: input.name,
                services: input.services,
                validFrom: input.validFrom,
                validUntil: input.validUntil,
                totalValueInCents: input.totalValueInCents,
                installments: input.installments,
                firstDueDate: input.firstDueDate,
                autoRenew: Boolean(input.autoRenew),
                ...(input.paymentMethod
                  ? { paymentMethod: input.paymentMethod }
                  : {}),
              })
            : options.groupId || options.document || options.appointments.length
              ? (
                  await api.purchasePlan({
                    idempotencyKey: purchaseKey,
                    plan: input,
                    ...options,
                  })
                ).plan
              : await api.createPlan(input);
          onSaved(plan);
        }}
      />
    </Modal>
  );
}
