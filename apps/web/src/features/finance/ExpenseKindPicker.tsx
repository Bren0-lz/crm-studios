import { useId } from "react";
import type {
  ExpenseDraft,
  ExpenseKind,
  ExpenseKindSwitch,
} from "./expense-kind";

const labels: Record<ExpenseKind, string> = {
  single: "Pontual (uma vez)",
  recurring: "Fixa (todo mês)",
};

export function ExpenseKindPicker({
  value,
  kindSwitch,
  draft,
}: {
  value: ExpenseKind;
  kindSwitch: ExpenseKindSwitch | undefined;
  /** Campos atuais do formulário, levados para o outro tipo na troca. */
  draft: ExpenseDraft;
}) {
  const name = useId();
  if (!kindSwitch || kindSwitch.kinds.length < 2) return null;
  return (
    <fieldset className="form-fieldset span-2">
      <legend>Tipo de despesa</legend>
      <div className="form-fieldset-grid">
        {kindSwitch.kinds.map((kind) => (
          <label className="checkbox-field" key={kind}>
            <input
              type="radio"
              name={name}
              data-expense-kind={kind}
              checked={value === kind}
              onChange={() => kindSwitch.onSwitch(kind, draft)}
            />
            {labels[kind]}
          </label>
        ))}
      </div>
      <p className="field-hint">
        {value === "single"
          ? "Uma conta a pagar só, com vencimento numa data."
          : "Repete todo mês (aluguel, internet, água, luz): cada mês vira uma conta a pagar no dia do vencimento."}
      </p>
    </fieldset>
  );
}
