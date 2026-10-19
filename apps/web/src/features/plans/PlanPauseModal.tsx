import type { PatientPlan, PlanPauseDetails } from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { formatIsoDate, localIsoDate } from "../../shared/lib/formatting";

/** Confirmação da pausa com motivo e previsão de retorno (opcionais). */
export function PlanPauseModal({
  plan,
  onClose,
  onConfirm,
}: {
  plan: PatientPlan;
  onClose: () => void;
  onConfirm: (pause: PlanPauseDetails) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const dirty = useFormDirty({ reason, expectedReturn });
  return (
    <ActionModal
      eyebrow="Planos e sessões"
      title="Pausar plano"
      subtitle={`${plan.patientName} · ${plan.name}`}
      effect={
        plan.validUntil
          ? `Enquanto pausado, o plano não é usado nos atendimentos. Ao reativar, a validade (hoje até ${formatIsoDate(plan.validUntil)}) avança os dias em que ficou pausado.`
          : "Enquanto pausado, o plano não é usado nos atendimentos. O plano não tem fim de validade, então nada muda nas datas."
      }
      confirmLabel="Pausar plano"
      validate={() =>
        expectedReturn && expectedReturn < localIsoDate()
          ? "A previsão de retorno não pode ser no passado."
          : ""
      }
      dirty={dirty}
      onClose={onClose}
      onConfirm={() =>
        onConfirm({
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(expectedReturn ? { expectedReturn } : {}),
        })
      }
    >
      <label>
        Motivo (opcional)
        <input
          maxLength={500}
          placeholder="Ex.: viagem, cirurgia"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <label>
        Previsão de retorno (opcional)
        <input
          type="date"
          min={localIsoDate()}
          value={expectedReturn}
          onChange={(event) => setExpectedReturn(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}
