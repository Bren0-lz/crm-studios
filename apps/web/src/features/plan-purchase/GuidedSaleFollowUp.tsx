import { useEffect, useRef, useState } from "react";
import { useAuthorization } from "../../authorization-context";
import { Modal } from "../../shared/components/Modal";
import type {
  GuidedFollowUpRequest,
  GuidedSaleItem,
} from "../../shared/workflows/GuidedSaleContext";
import { SignatureSendStep } from "../contracts/index";
import { PlanPaymentStep } from "./PlanPaymentStep";
import { PlanSessionsSentStep } from "./PlanSessionsSentStep";

type FollowUpStep =
  | {
      kind: "sign";
      sale: GuidedSaleItem & {
        document: NonNullable<GuidedSaleItem["document"]>;
      };
    }
  | {
      kind: "sessions";
      sale: GuidedSaleItem & {
        appointments: NonNullable<GuidedSaleItem["appointments"]>;
      };
    }
  | { kind: "pay"; sale: GuidedSaleItem };

/**
 * Passos finais da venda no cadastro de cliente, um de cada vez, com os mesmos passos do Novo
 * plano: `send` leva o link de cada contrato e os horários de cada avulso pelo WhatsApp;
 * `payment` pergunta se o cliente já pagou cada plano com contrato e mostra o recibo.
 */
export function GuidedSaleFollowUp({
  stage,
  patientName,
  sales,
  onDone,
}: GuidedFollowUpRequest) {
  const { can, canEdit } = useAuthorization();
  const canReceive = canEdit("finance") && can("finance.receive");
  const [steps] = useState<FollowUpStep[]>(() =>
    stage === "send"
      ? sales.flatMap((sale): FollowUpStep[] => [
          ...(sale.document
            ? [
                {
                  kind: "sign" as const,
                  sale: { ...sale, document: sale.document },
                },
              ]
            : []),
          ...(sale.appointments?.length
            ? [
                {
                  kind: "sessions" as const,
                  sale: { ...sale, appointments: sale.appointments },
                },
              ]
            : []),
        ])
      : canReceive
        ? sales
            .filter((sale) => sale.document)
            .map((sale) => ({ kind: "pay" as const, sale }))
        : [],
  );
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [nested, setNested] = useState(false);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  const step = steps[index];
  // Nada a mostrar neste estágio: segue direto.
  useEffect(() => {
    if (!step) doneRef.current();
  }, [step]);
  if (!step) return null;
  const next = () => {
    setNested(false);
    setIndex((value) => value + 1);
  };
  const { plan } = step.sale;
  return (
    <Modal
      eyebrow="Cadastro rápido"
      title={
        step.kind === "sign"
          ? "Enviar contrato"
          : step.kind === "sessions"
            ? "Enviar horários"
            : "Pagamento do plano"
      }
      subtitle={
        step.kind === "sign"
          ? `Plano ${plan.name} salvo. Envie o documento para ${patientName} assinar.`
          : step.kind === "sessions"
            ? `Plano ${plan.name} salvo. Envie as sessões para ${patientName} pelo WhatsApp.`
            : `Plano ${plan.name} salvo. Registre o pagamento de ${patientName}.`
      }
      busy={busy}
      inactive={nested}
      onClose={onDone}
    >
      {step.kind === "sign" ? (
        <SignatureSendStep
          key={index}
          prepare={() => Promise.resolve(step.sale.document)}
          onBusyChange={setBusy}
          onDone={next}
        />
      ) : step.kind === "sessions" ? (
        <PlanSessionsSentStep
          key={index}
          plan={plan}
          appointments={step.sale.appointments}
          onDone={next}
        />
      ) : (
        <PlanPaymentStep
          key={index}
          plan={plan}
          onBusyChange={setBusy}
          onNestedChange={setNested}
          onDone={next}
        />
      )}
    </Modal>
  );
}
