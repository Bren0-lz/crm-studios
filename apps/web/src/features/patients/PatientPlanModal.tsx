import type {
  Appointment,
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
import { groupEnrollmentToast } from "../../shared/lib/formatting";
import {
  issueDocumentForSignature,
  SignatureSendStep,
  SignatureTemplateField,
  useCanRequestSignature,
  useSignatureTemplates,
  type SignatureRequest,
} from "../contracts/index";
import {
  addToServiceWaitlist,
  PlanForm,
  type PlanCatalogKind,
} from "../plans/index";
import {
  PlanPaymentStep,
  PlanPurchaseOptions,
  PlanSessionsSentStep,
  type PurchaseOptions,
} from "../plan-purchase/index";

/**
 * Atalho da aba Planos da ficha: vincula o cliente a um plano recorrente ou avulso do
 * catálogo sem sair da ficha. Saldo e parcelas são criados na mesma operação.
 */
export function PatientPlanModal({
  patient,
  kind,
  initialTemplateId,
  scheduleSessions = true,
  initialServiceId,
  initialGroupId,
  onClose,
  onSaved,
  onWaitlisted,
}: {
  patient: PatientOption;
  kind: PlanCatalogKind;
  /** Plano cadastrado já escolhido (ex.: avulso do serviço, vendido no agendamento). */
  initialTemplateId?: string | undefined;
  /**
   * Oferece marcar as sessões do avulso na contratação. Desligado quando a venda parte do
   * próprio agendamento, que marca o atendimento depois.
   */
  scheduleSessions?: boolean | undefined;
  /** Matrícula pela Lista de espera: só planos do serviço, com a turma já escolhida. */
  initialServiceId?: string | undefined;
  initialGroupId?: string | undefined;
  onClose: () => void;
  /** `notice`: aviso da matrícula na turma (vaga confirmada ou lista de espera). */
  onSaved: (plan: PatientPlan, notice?: string) => void;
  /** Turma cheia (TW3): o cliente foi para a Lista de espera, sem plano; `message` é o aviso. */
  onWaitlisted?: ((message: string) => void) | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [nested, setNested] = useState(false);
  const [options, setOptions] = useState<PurchaseOptions>({ appointments: [] });
  const [blocked, setBlocked] = useState("");
  const [scheduled, setScheduled] = useState<{
    plan: PatientPlan;
    appointments: Appointment[];
  } | null>(null);
  const [services, setServices] = useState<Service[] | null>(null);
  const [error, setError] = useState("");
  // Matrícula na turma da contratação: o aviso acompanha o plano salvo (TW1).
  const [enrollmentNotice, setEnrollmentNotice] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const { can, canEdit } = useAuthorization();
  // Venda com documento: ao concluir o envio, pergunta se o cliente já pagou (baixa + recibo).
  const canReceive = canEdit("finance") && can("finance.receive");
  const [documentSent, setDocumentSent] = useState(false);
  const [paying, setPaying] = useState<PatientPlan | null>(null);
  // Recorrente de aulas em grupo: a matrícula na turma entra na mesma contratação.
  const groups = usePlanGroupChoices(
    kind !== "single" && can("plans.purchase") && can("groups.enroll"),
  );
  const [purchaseKey] = useState(() => crypto.randomUUID());
  // Avulso: as sessões são geradas pelos dias fixos e reservadas na mesma contratação.
  const purchase = can("plans.purchase") && scheduleSessions;
  const canSign = useCanRequestSignature();
  const templates = useSignatureTemplates(canSign);
  const [signature, setSignature] = useState<SignatureRequest | null>(null);
  // Plano salvo com documento: o modal passa para o envio do link de assinatura.
  const [sending, setSending] = useState<{
    plan: PatientPlan;
    prepare: () => Promise<IssuedDocument>;
  } | null>(null);
  function finish(plan: PatientPlan) {
    if (documentSent && canReceive) setPaying(plan);
    else onSaved(plan, enrollmentNotice);
  }
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
        paying
          ? `Plano ${paying.name} salvo. Registre o pagamento de ${patient.fullName}.`
          : scheduled
            ? `Plano ${scheduled.plan.name} salvo. Envie as sessões para ${patient.fullName} pelo WhatsApp.`
            : sending
              ? `Plano ${sending.plan.name} salvo. Envie o documento para ${patient.fullName} assinar.`
              : "O saldo e as contas a receber serão criados na mesma operação."
      }
      busy={busy}
      inactive={nested}
      onClose={
        paying
          ? () => onSaved(paying, enrollmentNotice)
          : scheduled
            ? () => onSaved(scheduled.plan, enrollmentNotice)
            : sending
              ? () => onSaved(sending.plan, enrollmentNotice)
              : onClose
      }
    >
      {paying ? (
        <PlanPaymentStep
          plan={paying}
          onBusyChange={setBusy}
          onNestedChange={setNested}
          onDone={() => onSaved(paying, enrollmentNotice)}
        />
      ) : scheduled && !sending ? (
        <PlanSessionsSentStep
          plan={scheduled.plan}
          appointments={scheduled.appointments}
          onDone={() => finish(scheduled.plan)}
        />
      ) : sending ? (
        <SignatureSendStep
          prepare={sending.prepare}
          onBusyChange={setBusy}
          onDone={() => (scheduled ? setSending(null) : finish(sending.plan))}
        />
      ) : services ? (
        <PlanForm
          patients={[patient]}
          fixedPatient={patient}
          services={services}
          catalogKind={kind}
          initialTemplateId={initialTemplateId}
          initialServiceId={initialServiceId}
          initialGroupId={initialGroupId}
          onWaitlist={
            onWaitlisted
              ? async (entry) =>
                  onWaitlisted(await addToServiceWaitlist(entry, groups))
              : undefined
          }
          groups={groups}
          onCancel={onClose}
          onBusyChange={setBusy}
          additionalDirty={Boolean(signature || options.appointments.length)}
          submitBlocked={blocked}
          renderAdditional={(input, groupId) => (
            <>
              {canSign && (
                <SignatureTemplateField
                  state={templates}
                  value={signature}
                  onChange={setSignature}
                />
              )}
              {purchase && kind === "single" && (
                <PlanPurchaseOptions
                  plan={input}
                  patients={[patient]}
                  services={services}
                  group={groups?.items?.find((item) => item.id === groupId)}
                  value={options}
                  onChange={setOptions}
                  onNestedChange={setNested}
                  onBlockedChange={setBlocked}
                />
              )}
            </>
          )}
          onSubmit={async (input, groupId) => {
            let document: IssuedDocument | undefined;
            let plan: PatientPlan;
            let booked: Appointment[] = [];
            let notice: string | undefined;
            const appointments =
              purchase && kind === "single" ? options.appointments : [];
            if (groupId || appointments.length) {
              // Com turma ou sessões, o documento entra na mesma contratação do plano.
              const result = await api.purchasePlan({
                idempotencyKey: purchaseKey,
                plan: input,
                appointments,
                ...(groupId ? { groupId } : {}),
                ...(signature ? { document: signature } : {}),
              });
              plan = result.plan;
              document = result.document;
              booked = result.appointments;
              if (result.enrollment) {
                notice = groupEnrollmentToast(
                  result.enrollment,
                  groups?.items?.find(
                    (item) => item.id === result.enrollment?.groupId,
                  )?.name,
                );
                setEnrollmentNotice(notice);
              }
              if (booked.length) setScheduled({ plan, appointments: booked });
            } else plan = await api.createPlan(input);
            if (!signature)
              return booked.length ? undefined : onSaved(plan, notice);
            setDocumentSent(true);
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
