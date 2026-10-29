import {
  nextCompetence,
  type CostCenter,
  type FinancialCategory,
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
  categories,
  costCenters,
  onClose,
  onLaunch,
}: {
  summary: PayrollSummary;
  branchIds: string[];
  categories: FinancialCategory[];
  costCenters: CostCenter[];
  onClose: () => void;
  onLaunch: (input: PayrollLaunchInput) => Promise<void>;
}) {
  const expenses = categories.filter((item) => item.kind === "expense");
  const [dueDate, setDueDate] = useState(
      `${nextCompetence(summary.competence)}-05`,
    ),
    [categoryId, setCategoryId] = useState(
      expenses.find((item) => /folha|sal[aá]rio|pessoal/i.test(item.name))
        ?.id ?? "",
    ),
    [costCenterId, setCostCenterId] = useState("");
  const dirty = useFormDirty({ dueDate, categoryId, costCenterId });
  const pending = summary.branches
    .flatMap((branch) => branch.lines)
    .filter((line) => line.pendingInCents > 0);
  const total = pending.reduce((sum, line) => sum + line.pendingInCents, 0);
  return (
    <ActionModal
      eyebrow="Folha de pagamento"
      title={`Lançar folha de ${formatCompetence(summary.competence)}`}
      subtitle={`${pending.length} ${pending.length === 1 ? "colaborador" : "colaboradores"} · ${currency.format(total / 100)}`}
      effect="Cada colaborador ganha uma despesa em Contas a pagar com o salário, as comissões e os ajustes pendentes, detalhados na observação. Pagar a despesa paga as comissões incluídas."
      confirmLabel="Lançar folha"
      missing={[
        ...(dueDate ? [] : ["Vencimento"]),
        ...(categoryId ? [] : ["Categoria da despesa"]),
      ]}
      dirty={dirty}
      onClose={onClose}
      onConfirm={() =>
        onLaunch({
          competence: summary.competence,
          ...(branchIds.length ? { branchIds } : {}),
          dueDate,
          categoryId,
          ...(costCenterId ? { costCenterId } : {}),
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
      <label>
        Categoria da despesa
        <select
          required
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">Selecione</option>
          {expenses.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className="span-2">
        Centro de custo
        <select
          value={costCenterId}
          onChange={(event) => setCostCenterId(event.target.value)}
        >
          <option value="">Sem centro de custo</option>
          {costCenters.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
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
