import { DomainError } from "../../repository.js";

/** Só contas abertas geradas por despesa fixa de valor variável aceitam o valor do mês. */
export function assertPayableAmountEditable(
  payable: {
    status: string;
    recurringPayableId?: string | null | undefined;
  },
  amountType: "fixed" | "variable" | undefined,
) {
  if (!payable.recurringPayableId)
    throw new DomainError(
      "PAYABLE_NOT_RECURRING",
      "Só contas geradas por despesa fixa têm o valor do mês informado aqui.",
      409,
    );
  if (amountType !== "variable")
    throw new DomainError(
      "PAYABLE_NOT_VARIABLE",
      "Só contas de despesa fixa de valor variável recebem o valor do mês.",
      409,
    );
  if (payable.status !== "open")
    throw new DomainError(
      "PAYABLE_NOT_OPEN",
      "Somente contas abertas podem ter o valor alterado.",
      409,
    );
}
