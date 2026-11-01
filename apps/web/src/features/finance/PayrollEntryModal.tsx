import {
  PAYROLL_ENTRY_MAX_PERCENT,
  payrollEntryAmount,
  type PayrollEmployee,
  type PayrollEntryInput,
} from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { currency } from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { formatCompetence } from "./model";

/** "10,5" → 1050 (centésimos de porcentagem); vazio ou inválido → 0. */
function parsePercent(text: string) {
  const value = Number(text.replace(/\s|%/g, "").replace(",", "."));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}

/**
 * Desconto ou recompensa do colaborador na competência. O salário fixo não muda: o valor
 * (em reais ou em porcentagem do salário fixo) entra ou sai do pagamento do mês.
 */
export function PayrollEntryModal({
  employee,
  competence,
  onClose,
  onSave,
}: {
  employee: PayrollEmployee;
  competence: string;
  onClose: () => void;
  onSave: (input: PayrollEntryInput) => Promise<void>;
}) {
  const hasSalary = employee.baseSalaryInCents > 0;
  const [kind, setKind] = useState<PayrollEntryInput["kind"]>("discount"),
    [mode, setMode] = useState<PayrollEntryInput["mode"]>("amount"),
    [amount, setAmount] = useState(0),
    [percent, setPercent] = useState(""),
    [reason, setReason] = useState("");
  const dirty = useFormDirty({ kind, mode, amount, percent, reason });
  const value = mode === "amount" ? amount : parsePercent(percent);
  const amountInCents = payrollEntryAmount(
    mode,
    value,
    employee.baseSalaryInCents,
  );
  const percentTooHigh =
    mode === "percent" && value > PAYROLL_ENTRY_MAX_PERCENT;
  return (
    <ActionModal
      eyebrow="Folha de pagamento"
      title={`Desconto ou recompensa · ${employee.name}`}
      subtitle={`Competência ${formatCompetence(competence)} · salário fixo ${currency.format(employee.baseSalaryInCents / 100)}`}
      effect="O salário fixo não muda. O valor entra (recompensa) ou sai (desconto) do pagamento deste mês e fica a lançar até a folha ser lançada."
      confirmLabel="Adicionar"
      missing={[
        ...(value > 0 && amountInCents > 0 ? [] : ["Valor"]),
        ...(reason.trim().length >= 3 ? [] : ["Motivo"]),
      ]}
      validate={() => (percentTooHigh ? "A porcentagem vai até 100%." : "")}
      dirty={dirty}
      onClose={onClose}
      onConfirm={() =>
        onSave({
          employeeId: employee.id,
          competence,
          kind,
          mode,
          value,
          reason: reason.trim(),
        })
      }
    >
      <label>
        Tipo
        <select
          value={kind}
          onChange={(event) =>
            setKind(event.target.value as PayrollEntryInput["kind"])
          }
        >
          <option value="discount">Desconto (sai do pagamento)</option>
          <option value="bonus">Recompensa (soma ao pagamento)</option>
        </select>
      </label>
      <label>
        Forma
        <select
          value={mode}
          onChange={(event) =>
            setMode(event.target.value as PayrollEntryInput["mode"])
          }
        >
          <option value="amount">Valor em reais</option>
          <option value="percent" disabled={!hasSalary}>
            Porcentagem do salário fixo
          </option>
        </select>
      </label>
      {mode === "amount" ? (
        <CurrencyField label="Valor" value={amount} onChange={setAmount} />
      ) : (
        <label>
          Porcentagem (%)
          <input
            inputMode="decimal"
            value={percent}
            placeholder="Ex.: 10 ou 2,5"
            onChange={(event) => setPercent(event.target.value)}
          />
        </label>
      )}
      <p className="field-hint" aria-live="polite">
        {amountInCents > 0
          ? `${kind === "discount" ? "Sai do pagamento" : "Soma ao pagamento"}: ${currency.format(amountInCents / 100)}`
          : hasSalary
            ? ""
            : "Sem salário fixo: informe o valor em reais."}
      </p>
      <label className="span-2">
        Motivo
        <textarea
          rows={3}
          maxLength={300}
          value={reason}
          placeholder="Ex.: faltas sem justificativa, meta do mês batida"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}
