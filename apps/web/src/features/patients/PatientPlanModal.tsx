import type {
  IssuedDocument,
  PatientOption,
  PatientPlan,
  Service,
} from "@crm/contracts";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { FixedPatient } from "../../shared/components/FixedPatient";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { Modal } from "../../shared/components/Modal";
import { usePlanGroupChoices } from "../../shared/hooks/usePlanGroupChoices";
import {
  issueDocumentForSignature,
  SignatureSendStep,
  SignatureTemplateField,
  useCanRequestSignature,
  useSignatureTemplates,
  type SignatureRequest,
} from "../contracts/index";
import { PlanForm, type PlanCatalogKind } from "../plans/index";

/**
 * Atalho da aba Planos da ficha: vincula o cliente a um plano recorrente ou avulso do
 * catálogo sem sair da ficha. Saldo e parcelas são criados na mesma operação.
 */
export function PatientPlanModal({
  patient,
  kind,
  onClose,
  onSaved,
}: {
  patient: PatientOption;
  kind: PlanCatalogKind;
  onClose: () => void;
  onSaved: (plan: PatientPlan) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [services, setServices] = useState<Service[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const { can } = useAuthorization();
  // Recorrente de aulas em grupo: a matrícula na turma entra na mesma contratação.
  const groups = usePlanGroupChoices(
    kind !== "single" && can("plans.purchase") && can("groups.enroll"),
  );
  const [purchaseKey] = useState(() => crypto.randomUUID());
  const canSign = useCanRequestSignature();
  const templates = useSignatureTemplates(canSign);
  const [signature, setSignature] = useState<SignatureRequest | null>(null);
  // Plano salvo com documento: o modal passa para o envio do link de assinatura.
  const [sending, setSending] = useState<{
    plan: PatientPlan;
    prepare: () => Promise<IssuedDocument>;
  } | null>(null);
  useEffect(() => {
    let active = true;
    api
      .services()
      .then((items) => active && setServices(items))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <Modal
      title={kind === "single" ? "Novo plano avulso" : "Novo plano recorrente"}
      subtitle={
        sending
          ? `Plano ${sending.plan.name} salvo. Envie o documento para ${patient.fullName} assinar.`
          : "O saldo e as contas a receber serão criados na mesma operação."
      }
      busy={busy}
      onClose={sending ? () => onSaved(sending.plan) : onClose}
    >
      {sending ? (
        <SignatureSendStep
          prepare={sending.prepare}
          onBusyChange={setBusy}
          onDone={() => onSaved(sending.plan)}
        />
      ) : services ? (
        <PlanForm
          patients={[patient]}
          fixedPatient={patient}
          services={services}
          catalogKind={kind}
          groups={groups}
          onCancel={onClose}
          onBusyChange={setBusy}
          additionalDirty={Boolean(signature)}
          renderAdditional={
            canSign
              ? () => (
                  <SignatureTemplateField
                    state={templates}
                    value={signature}
                    onChange={setSignature}
                  />
                )
              : undefined
          }
          onSubmit={async (input, groupId) => {
            let document: IssuedDocument | undefined;
            let plan: PatientPlan;
            if (groupId) {
              // Com turma, o documento entra na mesma contratação do plano.
              const result = await api.purchasePlan({
                idempotencyKey: purchaseKey,
                plan: input,
                appointments: [],
                groupId,
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
      ) : (
        <div className="form-grid">
          <FixedPatient patient={patient} />
          {error ? (
            <div className="form-error span-2" role="alert">
              {error}{" "}
              <button
                type="button"
                className="secondary-button button-sm"
                onClick={() => {
                  setError("");
                  setAttempt((value) => value + 1);
                }}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <LoadingBlock />
          )}
          <div className="modal-actions span-2">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Voltar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
