import { createHash } from "node:crypto";
import type { PlanPurchaseInput } from "@crm/contracts";
import { DomainError } from "../../repository.js";
import { clinicDateOf } from "../finance/daily-cash.js";
export function purchaseFingerprint(input: PlanPurchaseInput): string {
  function sorted(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, sorted(entry)]),
      );
    return value;
  }
  return createHash("sha256")
    .update(JSON.stringify(sorted(input)))
    .digest("hex");
}
export function validatePurchaseSchedule(
  input: PlanPurchaseInput,
  timezone: string,
) {
  for (const appointment of input.appointments) {
    const date = clinicDateOf(new Date(appointment.startsAt), timezone);
    if (
      !input.plan.services.some(
        (item) => item.serviceId === appointment.serviceId,
      ) ||
      date < input.plan.validFrom ||
      (input.plan.validUntil && date > input.plan.validUntil)
    )
      throw new DomainError(
        "PLAN_SCHEDULE_MISMATCH",
        "Os atendimentos devem usar os serviços e a vigência do plano.",
        400,
      );
  }
}
