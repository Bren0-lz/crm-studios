import {
  nextCompetence,
  PAYROLL_CATEGORY_NAME,
  type PayrollLaunchInput,
  type PayrollSummary,
} from "@crm/contracts";
import { useState } from "react";
import { ActionModal } from "../../shared/components/ActionModal";
import { currency } from "../../shared/lib/formatting";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { formatCompetence } from "./model";

/** Confirma o lançamento: uma despesa por colaborador com o que está pendente. */
export function PayrollLaunchModal({
  summary,
  branchIds,
  onClose,
  onLaunch,
}: {
  summary: PayrollSummary;
  branchIds: string[];
  onClose: () => void;
  onLaunch: (input: PayrollLaunchInput) => Promise<void>;
}) {
  const [dueDate, setDueDate] = useState(
    `${nextCompetence(summary.competence)}-05`,
  );
  const dirty = useFormDirty({ dueDate });
  const pending = summary.branches
    .flatMap((branch) => branch.lines)
    .filter((line) => line.pendingInCents > 0);
  const total = pending.reduce((sum, line) => sum + line.pendingInCents, 0);
  return (
    <ActionModal
      eyebrow="Folha de pagamento"
      title={`Lançar folha de ${formatCompetence(summary.competence)}`}
      subtitle={`${pending.length} ${pending.length === 1 ? "colaborador" : "colaboradores"} · ${currency.format(total / 100)}`}
      effect={`Cada colaborador ganha uma despesa em Contas a pagar, na categoria "${PAYROLL_CATEGORY_NAME}", com o salário, as comissões e os ajustes pendentes, detalhados na observação. Pagar a despesa paga as comissões incluídas.`}
      confirmLabel="Lançar folha"
      missing={dueDate ? [] : ["Vencimento"]}
      dirty={dirty}
      onClose={onClose}
      onConfirm={() =>
        onLaunch({
          competence: summary.competence,
          ...(branchIds.length ? { branchIds } : {}),
          dueDate,
        })
      }
    >
      <label>
        Vencimento
        <input
          type="date"
          required
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
      </label>
      <ul
        className="payroll-launch-list span-2"
        aria-label="O que será lançado"
      >
        {pending.map((line) => (
          <li key={line.employee.id}>
            <span>{line.employee.name}</span>
            <strong>{currency.format(line.pendingInCents / 100)}</strong>
          </li>
        ))}
      </ul>
    </ActionModal>
  );
}
