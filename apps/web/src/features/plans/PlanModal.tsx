import type { IssuedDocument, PatientPlan } from "@crm/contracts";
import { useAuthorization } from "../../authorization-context";
import {
  issueDocumentForSignature,
  SignatureSendStep,
  SignatureTemplateField,
  useCanRequestSignature,
  useSignatureTemplates,
  type SignatureRequest,
} from "../contracts/index";
import {
  PlanPurchaseOptions,
  type PurchaseOptions,
} from "./PlanPurchaseOptions";
import type { CloseGuard } from "../../shared/workflows/types";
import { useState, useCallback, useRef } from "react";
import { api } from "../../api";
import { Modal } from "../../shared/components/Modal";
import { usePlanGroupChoices } from "../../shared/hooks/usePlanGroupChoices";
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
  const [signature, setSignature] = useState<SignatureRequest | null>(null);
  // Plano salvo com documento: o modal passa para o envio do link de assinatura.
  const [sending, setSending] = useState<{
    plan: PatientPlan;
    prepare: () => Promise<IssuedDocument>;
  } | null>(null);
  const closeGuard = useRef<CloseGuard | null>(null);
  const registerCloseGuard = useCallback((guard: CloseGuard) => {
    closeGuard.current = guard;
    return () => {
      if (closeGuard.current === guard) closeGuard.current = null;
    };
  }, []);
  const close = () =>
    sending
      ? onSaved(sending.plan)
      : closeGuard.current
        ? closeGuard.current(onClose)
        : onClose();
  const [purchaseKey] = useState(() => crypto.randomUUID());
  // A matrícula entra na contratação: a turma fica no formulário (obrigatória em aulas em grupo).
  const purchase = !renewing && can("plans.purchase");
  const groups = usePlanGroupChoices(purchase && can("groups.enroll"));
  const canSign = useCanRequestSignature();
  const templates = useSignatureTemplates(canSign);
  return (
    <Modal
      title={renewing ? "Renovar plano" : "Novo plano"}
      subtitle={
        sending
          ? `Plano ${sending.plan.name} salvo. Envie o documento para ${sending.plan.patientName} assinar.`
          : renewing
            ? `${renewing.patientName} · ${renewing.serviceName}. O novo período recebe saldo e parcelas próprios; as sessões restantes do plano atual não são transferidas.`
            : "O saldo e as contas a receber serão criados na mesma operação."
      }
      busy={busy}
      inactive={nested}
      onClose={close}
    >
      {sending ? (
        <SignatureSendStep
          prepare={sending.prepare}
          onBusyChange={setBusy}
          onDone={() => onSaved(sending.plan)}
        />
      ) : (
        <PlanForm
          patients={patients}
          services={services}
          renewing={renewing}
          fixedPatient={fixedPatient}
          groups={groups}
          onCancel={onClose}
          registerCloseGuard={registerCloseGuard}
          additionalDirty={Boolean(signature || options.appointments.length)}
          onBusyChange={setBusy}
          renderAdditional={(input, groupId) => (
            <>
              {canSign && (
                <SignatureTemplateField
                  state={templates}
                  value={signature}
                  onChange={setSignature}
                />
              )}
              {purchase && (
                <PlanPurchaseOptions
                  plan={input}
                  patients={patients}
                  services={services}
                  group={groups?.items?.find((item) => item.id === groupId)}
                  value={options}
                  onChange={setOptions}
                  onNestedChange={setNested}
                />
              )}
            </>
          )}
          onSubmit={async (input, groupId) => {
            let document: IssuedDocument | undefined;
            let plan: PatientPlan;
            if (renewing)
              plan = await api.renewPlan(renewing.id, {
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
              });
            else if (
              purchase &&
              (groupId || signature || options.appointments.length)
            ) {
              // Na contratação o documento é emitido na mesma operação do plano.
              const result = await api.purchasePlan({
                idempotencyKey: purchaseKey,
                plan: input,
                ...options,
                ...(groupId ? { groupId } : {}),
                ...(signature ? { document: signature } : {}),
              });
              plan = result.plan;
              document = result.document;
            } else plan = await api.createPlan(input);
            if (!signature) return onSaved(plan);
            setSending({
              plan,
              prepare: document
                ? () => Promise.resolve(document)
                : () =>
                    issueDocumentForSignature({
                      ...signature,
                      patientId: plan.patientId,
                      planId: plan.id,
                    }),
            });
          }}
        />
      )}
    </Modal>
  );
}
