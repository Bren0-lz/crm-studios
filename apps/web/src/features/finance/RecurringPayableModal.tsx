import type { FinancialWorkspace, RecurringPayable } from "@crm/contracts";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { useFormDirty } from "../../shared/workflows/useDirtyGuard";
import { MoneyInput } from "../../shared/components/MoneyInput";
import { ExpenseAccountFields } from "./ExpenseAccountFields";
import { useExpenseClassifications } from "./useExpenseClassifications";
import { ExpenseKindPicker } from "./ExpenseKindPicker";
import {
  carriedId,
  EXPENSE_KIND_FOCUS,
  hasCarriedDraft,
  type ExpenseKindSwitch,
} from "./expense-kind";

/** "2026-10" → "outubro de 2026". */
function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

/** Cria uma despesa fixa ou, com `item`, edita a existente. */
export function RecurringPayableModal({
  workspace,
  currentMonth,
  item,
  onClose,
  onCreated,
  kindSwitch,
}: {
  workspace: FinancialWorkspace;
  currentMonth: string;
  item?: RecurringPayable | undefined;
  onClose: () => void;
  onCreated: () => void;
  /** No modal único de "Nova despesa": escolha entre pontual e fixa. */
  kindSwitch?: ExpenseKindSwitch | undefined;
}) {
  const draft = item ? undefined : kindSwitch?.draft;
  const { can } = useAuthorization();
  // Na edição, a categoria e o centro atuais continuam na lista mesmo se inativados.
  const classifications = useExpenseClassifications({
    workspace,
    keep: item,
    onCreated: (kind, id) =>
      setForm((current) => ({
        ...current,
        [kind === "category" ? "categoryId" : "costCenterId"]: id,
      })),
  });
  const { categories: expenseCategories, costCenters } = classifications;
  const [form, setForm] = useState({
    description: item?.description ?? draft?.description ?? "",
    supplier: item?.supplier ?? draft?.supplier ?? "",
    categoryId:
      item?.categoryId ??
      carriedId(draft?.categoryId, expenseCategories) ??
      expenseCategories[0]?.id ??
      "",
    costCenterId:
      item?.costCenterId ??
      carriedId(draft?.costCenterId, costCenters) ??
      costCenters[0]?.id ??
      "",
    amountType: item?.amountType ?? "fixed",
    amountInCents: item?.amountInCents ?? draft?.amountInCents ?? 0,
    dayOfMonth: item?.dayOfMonth ?? Math.min(new Date().getDate(), 28),
    remind: item ? item.reminderDaysBefore !== undefined : true,
    reminderDaysBefore: item?.reminderDaysBefore ?? 3,
    startMonth: item?.startMonth ?? currentMonth,
    endMonth: item?.endMonth ?? "",
  });
  const variable = form.amountType === "variable";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const dirty = useFormDirty(form) || hasCarriedDraft(draft);
  const picking = !item && kindSwitch !== undefined;
  const missing = useMissingFields(
    [
      form.description.trim().length < 3 &&
        "Descrição (pelo menos 3 caracteres)",
      !form.categoryId && "Categoria",
      form.remind &&
        !(
          Number.isInteger(form.reminderDaysBefore) &&
          form.reminderDaysBefore >= 0 &&
          form.reminderDaysBefore <= 30
        ) &&
        "Dias de antecedência do aviso (0 a 30)",
    ].filter((item): item is string => Boolean(item)),
  );
  const validDay =
    Number.isInteger(form.dayOfMonth) &&
    form.dayOfMonth >= 1 &&
    form.dayOfMonth <= 28;
  const scheduleSummary =
    validDay && form.startMonth
      ? [
          `Uma conta todo dia ${form.dayOfMonth}, de ${monthLabel(form.startMonth)}`,
          form.endMonth
            ? ` até ${monthLabel(form.endMonth)}`
            : " em diante, sem data final",
          form.remind && form.reminderDaysBefore > 0
            ? `, com aviso ${form.reminderDaysBefore} ${form.reminderDaysBefore === 1 ? "dia" : "dias"} antes.`
            : form.remind && form.reminderDaysBefore === 0
              ? ", com aviso no próprio dia."
              : ".",
        ].join("")
      : "O vencimento vai de 1 a 28 para existir em todos os meses.";
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const {
      supplier,
      endMonth,
      remind,
      reminderDaysBefore,
      costCenterId,
      ...rest
    } = form;
    const input = {
      ...rest,
      // Sem valor, cada conta do mês pede o valor quando chegar (valor variável).
      amountType:
        rest.amountInCents > 0 ? rest.amountType : ("variable" as const),
      description: rest.description.trim(),
      // Centro de custo é opcional: vazio não vai para a API.
      ...(costCenterId ? { costCenterId } : {}),
      ...(supplier.trim() ? { supplier: supplier.trim() } : {}),
      ...(remind ? { reminderDaysBefore } : {}),
      ...(endMonth ? { endMonth } : {}),
      active: item?.active ?? true,
    };
    try {
      if (item) await api.updateRecurringPayable(item.id, input);
      else await api.createRecurringPayable(input);
      onCreated();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <Modal
        title={
          item
            ? "Editar despesa fixa"
            : picking
              ? "Nova despesa"
              : "Nova despesa fixa"
        }
        subtitle={
          item
            ? "As mudanças valem para as contas dos próximos meses."
            : "A conta a pagar é gerada todo mês, do mês inicial até o final."
        }
        {...(picking ? { initialFocus: EXPENSE_KIND_FOCUS } : {})}
        busy={loading}
        inactive={classifications.creating !== null}
        dirty={dirty}
        onClose={onClose}
      >
        {can(
          item ? "finance.recurring_update" : "finance.recurring_create",
        ) && (
          <form className="form-grid" onSubmit={submit}>
            {!item && (
              <ExpenseKindPicker
                value="recurring"
                kindSwitch={kindSwitch}
                draft={{
                  description: form.description,
                  supplier: form.supplier,
                  categoryId: form.categoryId,
                  costCenterId: form.costCenterId,
                  amountInCents: form.amountInCents,
                }}
              />
            )}
            <ExpenseAccountFields
              value={form}
              onChange={(patch) =>
                setForm((current) => ({ ...current, ...patch }))
              }
              categories={expenseCategories}
              costCenters={costCenters}
              onCreate={classifications.setCreating}
            />
            <fieldset className="form-fieldset span-2">
              <legend>Valor</legend>
              <div className="form-fieldset-grid">
                <label>
                  Tipo de valor
                  <select
                    value={form.amountType}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        amountType:
                          event.target.value === "variable"
                            ? "variable"
                            : "fixed",
                      })
                    }
                  >
                    <option value="fixed">Valor fixo</option>
                    <option value="variable">Valor variável</option>
                  </select>
                </label>
                <label>
                  {variable
                    ? "Valor estimado (opcional)"
                    : "Valor mensal (opcional)"}
                  <MoneyInput
                    valueInCents={form.amountInCents}
                    onChange={(cents) =>
                      setForm({ ...form, amountInCents: cents ?? 0 })
                    }
                  />
                </label>
                <span className="field-hint span-2">
                  {variable
                    ? "Muda todo mês, como água e luz: informe o valor de cada conta quando ela chegar. Se souber, a estimativa já entra na previsão do caixa."
                    : form.amountInCents > 0
                      ? "O mesmo valor todo mês, como internet e aluguel."
                      : "O mesmo valor todo mês, como internet e aluguel. Sem valor, informe o de cada conta quando ela chegar."}
                </span>
              </div>
            </fieldset>
            <fieldset className="form-fieldset recurring-schedule span-2">
              <legend>Vencimento</legend>
              <div className="form-fieldset-grid">
                <label>
                  Mês inicial
                  <input
                    required
                    type="month"
                    value={form.startMonth}
                    onChange={(event) =>
                      setForm({ ...form, startMonth: event.target.value })
                    }
                  />
                </label>
                <label>
                  Mês final (opcional)
                  <input
                    type="month"
                    min={form.startMonth}
                    value={form.endMonth}
                    onChange={(event) =>
                      setForm({ ...form, endMonth: event.target.value })
                    }
                  />
                </label>
                <label>
                  Dia do vencimento
                  <input
                    required
                    type="number"
                    min="1"
                    max="28"
                    step="1"
                    value={form.dayOfMonth}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        dayOfMonth: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={form.remind}
                    onChange={(event) =>
                      setForm({ ...form, remind: event.target.checked })
                    }
                  />
                  Avisar antes do vencimento
                </label>
                <label>
                  Dias de antecedência do aviso
                  <input
                    required={form.remind}
                    disabled={!form.remind}
                    type="number"
                    min="0"
                    max="30"
                    step="1"
                    value={form.reminderDaysBefore}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        reminderDaysBefore: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <p className="field-hint" aria-live="polite">
                {scheduleSummary}
              </p>
            </fieldset>
            {error && <div className="form-error span-2">{error}</div>}
            {missing.hint}
            <div className="modal-actions span-2">
              <ModalCancelButton disabled={loading}>Voltar</ModalCancelButton>
              <button
                className="primary-button"
                disabled={loading || missing.blocked}
                aria-describedby={missing.describedBy}
              >
                {loading
                  ? "Salvando…"
                  : item
                    ? "Salvar alterações"
                    : "Cadastrar despesa fixa"}
              </button>
            </div>
          </form>
        )}
      </Modal>
      {classifications.registry}
    </>
  );
}
