/** Despesa pontual (uma conta a pagar) ou fixa (gerada todo mês). */
export type ExpenseKind = "single" | "recurring";

/** Campos levados de um formulário para o outro ao trocar o tipo de despesa. */
export type ExpenseDraft = {
  description: string;
  supplier: string;
  categoryId: string;
  costCenterId: string;
  amountInCents: number;
};

/** Escolha do tipo no modal único de "Nova despesa". */
export type ExpenseKindSwitch = {
  /** Tipos que o perfil pode cadastrar; com um só, a escolha não aparece. */
  kinds: ExpenseKind[];
  /** Campos já preenchidos no outro tipo, antes da troca. */
  draft?: Partial<ExpenseDraft> | undefined;
  onSwitch: (kind: ExpenseKind, draft: ExpenseDraft) => void;
};

/** Valor da opção "+ Nova …" no fim do select: abre o cadastro por cima em vez de selecionar. */
export const CREATE_OPTION_VALUE = "__create__";

/** Seletor focado ao abrir (ou trocar) o tipo: a opção marcada. */
export const EXPENSE_KIND_FOCUS = "input[data-expense-kind]:checked";

/** Algum campo preenchido veio do outro tipo: fechar pergunta antes de descartar. */
export function hasCarriedDraft(draft: Partial<ExpenseDraft> | undefined) {
  return Boolean(
    draft &&
    (draft.description?.trim() ||
      draft.supplier?.trim() ||
      (draft.amountInCents ?? 0) > 0),
  );
}

/** Categoria ou centro trazido do outro tipo, só se existir na lista deste. */
export function carriedId(
  id: string | undefined,
  options: { id: string }[],
): string | undefined {
  return id && options.some((option) => option.id === id) ? id : undefined;
}
