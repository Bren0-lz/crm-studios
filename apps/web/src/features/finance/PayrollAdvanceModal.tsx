import {
  saoPauloToday,
  type PaymentMethod,
  type PayrollAdvanceInput,
  type PayrollEmployee,
} from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { CurrencyField } from "../../shared/components/CurrencyField";
import { currency } from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { formatCompetence, paymentMethodOptions } from "./model";

/** Data da entrega ("aaaa-mm-dd") → instante: hoje = agora; outro dia = meio-dia em Brasília. */
function paidAtOf(date: string) {
  return date === saoPauloToday()
    ? undefined
    : new Date(`${date}T12:00:00-03:00`).toISOString();
}

/**
 * Vale (adiantamento) do colaborador: sai do caixa na entrega, como despesa já paga em Contas
 * a pagar, e é descontado do pagamento do mês escolhido na folha.
 */
export function PayrollAdvanceModal({
  employees,
  employee,
  competence,
  onClose,
  onSave,
}: {
  /** Colaboradores ativos que podem receber o vale. */
  employees: PayrollEmployee[];
  /** Aberto pela linha do colaborador: já vem escolhido. */
  employee?: PayrollEmployee;
  competence: string;
  onClose: () => void;
  onSave: (input: PayrollAdvanceInput) => Promise<void>;
}) {
  const [employeeId, setEmployeeId] = useState(employee?.id ?? ""),
    [amount, setAmount] = useState(0),
    [month, setMonth] = useState(competence),
    [paidOn, setPaidOn] = useState(saoPauloToday()),
    [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix"),
    [reason, setReason] = useState("");
  const dirty = useFormDirty({
    employeeId,
    amount,
    month,
    paidOn,
    paymentMethod,
    reason,
  });
  const chosen = employees.find((item) => item.id === employeeId) ?? employee;
  return (
    <ActionModal
      eyebrow="Folha de pagamento"
      title={employee ? `Vale · ${employee.name}` : "Novo vale"}
      subtitle="Adiantamento descontado do salário"
      effect={
        month
          ? `Cria uma despesa já paga em Contas a pagar (sai do caixa na data da entrega) e desconta o valor do pagamento de ${formatCompetence(month)}.`
          : "Cria uma despesa já paga em Contas a pagar e desconta o valor do pagamento do mês escolhido."
      }
      confirmLabel="Registrar vale"
      missing={[
        ...(employeeId ? [] : ["Colaborador"]),
        ...(amount > 0 ? [] : ["Valor"]),
        ...(month ? [] : ["Mês do desconto"]),
        ...(paidOn ? [] : ["Data da entrega"]),
      ]}
      validate={() =>
        paidOn > saoPauloToday()
          ? "A data da entrega não pode ser no futuro."
          : ""
      }
      dirty={dirty}
      onClose={onClose}
      onConfirm={() => {
        const paidAt = paidAtOf(paidOn);
        return onSave({
          employeeId,
          competence: month,
          amountInCents: amount,
          paymentMethod,
          ...(paidAt ? { paidAt } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        });
      }}
    >
      {employee ? null : (
        <label className="span-2">
          Colaborador
          <select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">Escolha quem recebe</option>
            {employees.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <CurrencyField label="Valor" value={amount} onChange={setAmount} />
      <label>
        Mês do desconto
        <input
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
      </label>
      <label>
        Data da entrega
        <input
          type="date"
          value={paidOn}
          max={saoPauloToday()}
          onChange={(event) => setPaidOn(event.target.value)}
        />
      </label>
      <label>
        Forma de pagamento
        <select
          value={paymentMethod}
          onChange={(event) =>
            setPaymentMethod(event.target.value as PaymentMethod)
          }
        >
          {paymentMethodOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <p className="field-hint span-2" aria-live="polite">
        {chosen && amount > 0 && month
          ? `Sai do pagamento de ${formatCompetence(month)} de ${chosen.name}: ${currency.format(amount / 100)}`
          : ""}
      </p>
      <label className="span-2">
        Motivo (opcional)
        <textarea
          rows={2}
          maxLength={300}
          value={reason}
          placeholder="Ex.: adiantamento pedido pelo colaborador"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}
