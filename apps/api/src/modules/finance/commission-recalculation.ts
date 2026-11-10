import { createHash } from "node:crypto";
import type {
  AdminUserCommissionInput,
  CommissionEntry,
  CommissionRecalculationItem,
  CommissionRecalculationPreview,
} from "@crm/contracts";
import { DomainError } from "../../repository.js";
import {
  commissionAmount,
  selectCommissionRule,
  type CommissionTerms,
} from "./commission-calculation.js";

/** Dono das regras gravadas: profissional (Financeiro) ou usuário (Configurações). */
export type CommissionRuleOwner =
  { professionalId: string } | { userId: string };

/** Comissão já lançada com o que o recálculo precisa saber da origem. */
export interface CommissionRecalculationSource {
  commission: CommissionEntry;
  /** Dia do atendimento/presença no fuso da clínica. */
  date: string;
  serviceId: string;
  /** Usuário ligado ao profissional da comissão. */
  userId?: string;
  /** Ajustes já lançados para o profissional da comissão. */
  adjustmentsInCents: number;
  hasAdjustments: boolean;
  /** Comissão lançada como despesa (o pagamento segue a despesa). */
  managedByExpense: boolean;
}

/** Retrato da regra gravado na comissão (mesmo formato da geração). */
export function commissionRuleSnapshot(
  rule: AdminUserCommissionInput,
): AdminUserCommissionInput {
  return {
    percentage: rule.percentage,
    effectiveFrom: rule.effectiveFrom,
    ...(rule.effectiveUntil ? { effectiveUntil: rule.effectiveUntil } : {}),
  };
}

/** Regra gravada pelo cadastro do usuário (só a comissão geral). */
export function userCommissionDrafts(input: {
  commission?: AdminUserCommissionInput | undefined;
}) {
  return input.commission ? [input.commission] : [];
}

/**
 * Mesmo dono e mesmo início: a gravação corrige a regra existente (regras antigas por serviço
 * ficam de fora: não existem mais).
 */
export function sameCommissionRuleSlot(
  rule: CommissionTerms,
  owner: CommissionRuleOwner,
  terms: AdminUserCommissionInput,
) {
  return (
    ("userId" in owner
      ? rule.userId === owner.userId
      : rule.professionalId === owner.professionalId) &&
    !rule.serviceId &&
    rule.effectiveFrom === terms.effectiveFrom
  );
}

/**
 * Regras como ficariam depois de gravar `drafts`: a vigência repetida substitui os termos
 * da regra existente (mantém o id); as demais entram com id provisório. Devolve também os
 * ids que o recálculo deve considerar.
 */
export function withDraftCommissionRules(
  rules: CommissionTerms[],
  owner: CommissionRuleOwner,
  drafts: AdminUserCommissionInput[],
) {
  const next = rules.map((rule) => ({ ...rule }));
  const changed = new Set<string>();
  drafts.forEach((terms, index) => {
    const current = next.find((rule) =>
      sameCommissionRuleSlot(rule, owner, terms),
    );
    if (current) {
      for (const key of [
        "kind",
        "fixedAmountInCents",
        "effectiveUntil",
      ] as const)
        delete current[key];
      Object.assign(current, terms, { active: true });
      changed.add(current.id);
      return;
    }
    const id = `draft-${index}`;
    next.push({ ...terms, ...owner, id, active: true });
    changed.add(id);
  });
  return { rules: next, changed };
}

/** Período alcançado: do início mais antigo ao maior fim (ou hoje, se algum não termina). */
export function commissionRecalculationRange(
  drafts: AdminUserCommissionInput[],
  today: string,
) {
  const from = drafts.map((item) => item.effectiveFrom).sort()[0] ?? today;
  const ends = drafts.map((item) => item.effectiveUntil);
  const until = ends.every(Boolean) ? (ends as string[]).sort().at(-1)! : today;
  return { from, until: until < today ? until : today };
}

/**
 * Recalcula as comissões cujas origens passam a usar uma das regras `changed` (mesma escolha
 * de `selectCommissionRule`, olhando a data). Origens antes do início da regra ou com regra
 * mais específica continuam como estão.
 */
export function planCommissionRecalculation(
  rules: CommissionTerms[],
  changed: ReadonlySet<string>,
  sources: CommissionRecalculationSource[],
  range: { from: string; until: string },
): CommissionRecalculationPreview {
  const items: CommissionRecalculationItem[] = [];
  for (const source of sources) {
    const { commission } = source;
    const rule = selectCommissionRule(
      rules,
      commission.professionalId,
      source.userId,
      source.date,
    );
    if (!rule || !changed.has(rule.id)) continue;
    const amountInCents = commissionAmount(rule, commission.baseAmountInCents),
      previousAmountInCents =
        commission.amountInCents + source.adjustmentsInCents,
      mode =
        commission.status === "open" &&
        !source.hasAdjustments &&
        !source.managedByExpense
          ? ("update" as const)
          : ("adjustment" as const);
    // Mesmo valor: nada a recalcular (a comissão continua com a regra que a gerou).
    if (amountInCents === previousAmountInCents) continue;
    items.push({
      commissionId: commission.id,
      professionalId: commission.professionalId,
      professionalName: commission.professionalName,
      competence: commission.competence,
      sourceDate: source.date,
      status: commission.status,
      mode,
      previousAmountInCents,
      amountInCents,
      differenceInCents: amountInCents - previousAmountInCents,
      ruleSnapshot: commissionRuleSnapshot(rule),
    });
  }
  items.sort(
    (a, b) =>
      a.sourceDate.localeCompare(b.sourceDate) ||
      a.commissionId.localeCompare(b.commissionId),
  );
  const sum = (list: CommissionRecalculationItem[]) =>
    list.reduce((total, item) => total + item.differenceInCents, 0);
  return {
    ...range,
    items,
    differenceInCents: sum(items),
    adjustmentInCents: sum(items.filter((item) => item.mode === "adjustment")),
    digest: createHash("sha256")
      .update(
        JSON.stringify(
          items.map((item) => [
            item.commissionId,
            item.mode,
            item.previousAmountInCents,
            item.amountInCents,
          ]),
        ),
      )
      .digest("hex"),
  };
}

/** A prévia confirmada na tela precisa ser a mesma calculada na gravação. */
export function assertCommissionRecalculationDigest(
  plan: CommissionRecalculationPreview,
  expectedDigest: string | undefined,
) {
  if (expectedDigest !== undefined && plan.digest !== expectedDigest)
    throw new DomainError(
      "COMMISSION_RECALCULATION_STALE",
      "As comissões mudaram desde a prévia. Revise a prévia antes de salvar.",
      409,
    );
  if (
    plan.items.some(
      (item) =>
        !Number.isSafeInteger(item.differenceInCents) ||
        Math.abs(item.amountInCents) > 2147483647 ||
        Math.abs(item.differenceInCents) > 2147483647,
    )
  )
    throw new DomainError(
      "COMMISSION_AMOUNT_LIMIT",
      "O ajuste excede o limite financeiro permitido.",
      409,
    );
}

/** Motivo gravado na conciliação e nos ajustes gerados pelo recálculo. */
export function commissionRecalculationReason(from: string) {
  const [year, month, day] = from.split("-");
  return `Recálculo retroativo pela regra de comissão válida desde ${day}/${month}/${year}.`;
}

/** Metadados da auditoria `commission.recalculated`. */
export function commissionRecalculationAudit(
  plan: CommissionRecalculationPreview,
  ruleIds: string[],
) {
  return {
    ruleIds,
    from: plan.from,
    until: plan.until,
    count: plan.items.length,
    differenceInCents: plan.differenceInCents,
    adjustmentInCents: plan.adjustmentInCents,
    items: plan.items.map((item) => ({
      commissionId: item.commissionId,
      mode: item.mode,
      previousAmountInCents: item.previousAmountInCents,
      amountInCents: item.amountInCents,
    })),
  };
}
