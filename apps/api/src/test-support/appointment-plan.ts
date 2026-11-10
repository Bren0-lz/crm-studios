import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import {
  appointmentPricing,
  appointmentCreateInputSchema,
  recurringAppointmentCreateInputSchema,
  recurringOccurrenceStarts,
  type PatientPlan,
} from "@crm/contracts";
import type { TestApp } from "./legacy-fixtures.js";

/**
 * Fixtures dos testes de agenda que não estão verificando a obrigatoriedade de plano.
 * Prepara um plano real e envia seu id, sem alterar app.inject nem a validação da API.
 * Os testes de PLAN_REQUIRED usam app.inject diretamente e não chamam este helper.
 */
export async function withAppointmentPlan<T extends object>(
  app: TestApp,
  input: T,
  requestHeaders?: Record<string, string>,
): Promise<T & { planId?: string }> {
  const raw = input as Record<string, unknown>;
  const parsed = (
    raw.occurrences !== undefined
      ? recurringAppointmentCreateInputSchema
      : appointmentCreateInputSchema
  ).safeParse(input);
  if (!parsed.success) return input;
  const body = parsed.data as unknown as Record<string, unknown>;
  if (
    body.planId ||
    body.visitType === "trial" ||
    typeof body.patientId !== "string" ||
    typeof body.serviceId !== "string" ||
    typeof body.startsAt !== "string"
  )
    return input;
  const clinicId = "11111111-1111-4111-8111-111111111111",
    actorId = "22222222-2222-4222-8222-222222222222";
  const headers = {
    ...requestHeaders,
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  const patient = await app.inject({
    url: `/patients/${body.patientId}`,
    headers,
  });
  const servicesResponse = await app.inject({ url: "/services", headers });
  if (
    patient.statusCode !== 200 ||
    servicesResponse.statusCode !== 200 ||
    !servicesResponse
      .json<{ id: string }[]>()
      .some((service) => service.id === body.serviceId)
  )
    return input;
  const starts = body.occurrences
    ? recurringOccurrenceStarts(
        body as unknown as {
          startsAt: string;
          occurrences: number;
          intervalWeeks: number;
          customStartsAt?: string[];
        },
      )
    : [body.startsAt];
  const listed = await app.inject({
    url: `/plans?patientId=${body.patientId}`,
    headers,
  });
  const plans =
    listed.statusCode === 200
      ? listed
          .json<PatientPlan[]>()
          .filter(
            (plan) =>
              plan.patientId === body.patientId && !plan.sourceAppointmentId,
          )
      : [];
  const candidates = appointmentPricing(
    body.serviceId,
    plans,
    [],
    starts[0]!.slice(0, 10),
  ).plans;
  const candidate = candidates.find(
    (plan) =>
      (plan.unlimited || plan.remainingSessions >= starts.length) &&
      starts.every(
        (start) =>
          appointmentPricing(
            body.serviceId as string,
            plans.filter((p) => p.id === plan.planId),
            [],
            start.slice(0, 10),
          ).plans.length > 0,
      ),
  );
  if (candidate) return { ...input, planId: candidate.planId };
  const composition = [
    {
      serviceId: body.serviceId,
      totalSessions: Math.max(32, starts.length),
      totalValueInCents: 0,
    },
  ];
  const template = await app.inject({
    method: "POST",
    url: "/plan-templates",
    headers,
    payload: {
      name: `Plano do cenário ${randomUUID()}`,
      services: composition,
      totalValueInCents: 0,
    },
  });
  expect(template.statusCode, template.body).toBe(201);
  const sale = await app.inject({
    method: "POST",
    url: "/plans",
    headers,
    payload: {
      patientId: body.patientId,
      planTemplateId: template.json().id,
      name: template.json().name,
      kind: "fixed_package",
      services: composition,
      validFrom: "1900-01-01",
      validUntil: "2199-12-31",
      totalValueInCents: 0,
      installments: 1,
      firstDueDate: body.startsAt.slice(0, 10),
      autoRenew: false,
    },
  });
  expect(sale.statusCode, sale.body).toBe(201);
  return { ...input, planId: sale.json<{ id: string }>().id };
}
