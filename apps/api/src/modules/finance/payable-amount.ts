import { DomainError } from "../../repository.js";

/** Só contas abertas geradas por despesa fixa aceitam o valor do mês. */
export function assertPayableAmountEditable(payable: {
  status: string;
  recurringPayableId?: string | null | undefined;
}) {
  if (!payable.recurringPayableId)
    throw new DomainError(
      "PAYABLE_NOT_RECURRING",
      "Só contas geradas por despesa fixa têm o valor do mês informado aqui.",
      409,
    );
  if (payable.status !== "open")
    throw new DomainError(
      "PAYABLE_NOT_OPEN",
      "Somente contas abertas podem ter o valor alterado.",
      409,
    );
}
