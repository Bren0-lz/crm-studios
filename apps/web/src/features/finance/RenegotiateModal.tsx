import { type Receivable, saoPauloToday } from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { currency, reaisToCents } from "../../shared/lib/formatting";

export function RenegotiateModal({
  receivables,
  onClose,
  onConfirm,
}: {
  receivables: Receivable[];
  onClose: () => void;
  onConfirm: (input: {
    totalAmountInCents: number;
    installments: number;
    firstDueDate: string;
    reason: string;
  }) => Promise<void>;
}) {
  const total = receivables.reduce((sum, item) => sum + item.amountInCents, 0);
  const [value, setValue] = useState(String(total / 100));
  const [installments, setInstallments] = useState(String(receivables.length));
  const [firstDueDate, setFirstDueDate] = useState(saoPauloToday());
  const [reason, setReason] = useState("");
  const names = [...new Set(receivables.map((item) => item.patientName))].join(
    ", ",
  );
  const count = Number(installments);
  return (
    <ActionModal
      eyebrow="Financeiro"
      title="Renegociar parcelas"
      subtitle={`${names} · ${receivables.length} parcela${receivables.length === 1 ? "" : "s"} · ${currency.format(total / 100)}`}
      effect="As parcelas selecionadas são canceladas e substituídas pelas novas, com o valor total dividido igualmente e vencimentos mensais a partir da primeira data."
      validate={() => {
        if (reaisToCents(value) === null)
          return "Informe o novo valor total em reais (zero ou mais).";
        if (!Number.isInteger(count) || count < 1 || count > 36)
          return "Informe de 1 a 36 parcelas.";
        if (!firstDueDate) return "Escolha a data do primeiro vencimento.";
        if (reason.trim().length < 5)
          return "Escreva o motivo da renegociação (pelo menos 5 caracteres).";
        return "";
      }}
      onConfirm={() =>
        onConfirm({
          totalAmountInCents: reaisToCents(value) ?? 0,
          installments: count,
          firstDueDate,
          reason: reason.trim(),
        })
      }
      onClose={onClose}
    >
      <label>
        Novo valor total (R$)
        <input
          autoFocus
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <label>
        Número de parcelas
        <input
          type="number"
          min="1"
          max="36"
          step="1"
          value={installments}
          onChange={(event) => setInstallments(event.target.value)}
        />
      </label>
      <label>
        Primeiro vencimento
        <input
          type="date"
          value={firstDueDate}
          onChange={(event) => setFirstDueDate(event.target.value)}
        />
      </label>
      <label className="span-2">
        Motivo da renegociação
        <input
          maxLength={500}
          placeholder="Ex.: cliente pediu para parcelar o saldo"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </ActionModal>
  );
}
