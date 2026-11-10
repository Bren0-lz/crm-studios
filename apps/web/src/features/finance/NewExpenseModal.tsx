import type { FinancialWorkspace } from "@crm/contracts";
import { useState } from "react";
import type { ExpenseDraft, ExpenseKind } from "./expense-kind";
import { PayableModal } from "./PayableModal";
import { RecurringPayableModal } from "./RecurringPayableModal";

/**
 * "Nova despesa": um só botão para a despesa pontual (conta a pagar) e a fixa
 * (gerada todo mês, de valor fixo ou variável). O tipo é escolhido no modal;
 * ao trocar, descrição, fornecedor, categoria, centro e valor vão junto.
 */
export function NewExpenseModal({
  workspace,
  currentMonth,
  kinds,
  onClose,
  onCreated,
}: {
  workspace: FinancialWorkspace;
  currentMonth: string;
  /** Tipos que o perfil pode cadastrar (o primeiro abre marcado). */
  kinds: ExpenseKind[];
  onClose: () => void;
  onCreated: (kind: ExpenseKind) => void;
}) {
  const [kind, setKind] = useState<ExpenseKind>(kinds[0] ?? "single");
  const [draft, setDraft] = useState<Partial<ExpenseDraft>>();
  const kindSwitch = {
    kinds,
    draft,
    onSwitch: (next: ExpenseKind, current: ExpenseDraft) => {
      setDraft(current);
      setKind(next);
    },
  };
  return kind === "single" ? (
    <PayableModal
      key="single"
      workspace={workspace}
      kindSwitch={kindSwitch}
      onClose={onClose}
      onCreated={() => onCreated("single")}
    />
  ) : (
    <RecurringPayableModal
      key="recurring"
      workspace={workspace}
      currentMonth={currentMonth}
      kindSwitch={kindSwitch}
      onClose={onClose}
      onCreated={() => onCreated("recurring")}
    />
  );
}
