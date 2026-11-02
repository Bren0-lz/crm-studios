/** Como o 1º pagamento do plano recorrente é definido: calculado ou informado à mão. */
export type PlanFirstChargeChoice =
  { manual: false } | { manual: true; amountInCents: number | undefined };

export type FirstChargeTerms = {
  manualFirstCharge?: boolean | undefined;
  proratedChargeInCents?: number | undefined;
};

/** Aplica a escolha nos termos do plano (desligar o proporcional guarda o valor informado). */
export function withFirstChargeChoice<T extends FirstChargeTerms>(
  plan: T,
  choice: PlanFirstChargeChoice,
): T {
  const next = { ...plan };
  delete next.manualFirstCharge;
  delete next.proratedChargeInCents;
  if (!choice.manual) return next;
  return {
    ...next,
    manualFirstCharge: true,
    ...(choice.amountInCents !== undefined
      ? { proratedChargeInCents: choice.amountInCents }
      : {}),
  };
}
