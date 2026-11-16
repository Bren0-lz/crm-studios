import type { AdminAuditPage } from "@crm/contracts";
import { saoPauloToday } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

type Headers = { authorization: string };
type App = Awaited<ReturnType<typeof authenticatedApp>>["app"];

async function history(app: App, headers: Headers, action: string) {
  return (
    await app.inject({
      url: `/history/audit-events?action=${action}`,
      headers,
    })
  ).json<AdminAuditPage>().items;
}

async function paidReceivable(app: App, headers: Headers) {
  const [patients, services] = await Promise.all([
    app.inject({ method: "GET", url: "/patients", headers }),
    app.inject({ method: "GET", url: "/services", headers }),
  ]);
  const patient = patients.json()[0];
  const service = services.json()[0];
  const date = saoPauloToday();
  const plan = await app.inject({
    method: "POST",
    url: "/plans",
    headers,
    payload: await configuredPlan(app, {
      services: [
        { serviceId: service.id, totalSessions: 1, totalValueInCents: 10_000 },
      ],
      patientId: patient.id,
      serviceId: service.id,
      name: "Plano do estorno com motivo",
      kind: "fixed_package",
      totalSessions: 1,
      validFrom: date,
      totalValueInCents: 10_000,
      installments: 1,
      firstDueDate: date,
    }),
  });
  expect(plan.statusCode).toBe(201);
  const receivable = (
    await app.inject({ method: "GET", url: "/finance/workspace", headers })
  )
    .json<{ summary: { receivables: { id: string; planId?: string }[] } }>()
    .summary.receivables.find((item) => item.planId === plan.json().id)!;
  const paid = await app.inject({
    method: "POST",
    url: `/finance/receivables/${receivable.id}/pay`,
    headers,
    payload: { paymentMethod: "pix" },
  });
  expect(paid.statusCode).toBe(200);
  return receivable.id;
}

describe("E7c: estorno e cancelamento de contrato pedem motivo", () => {
  it("estorno de recebimento exige motivo e o mostra no Histórico", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      const receivableId = await paidReceivable(app, headers);
      const url = `/finance/receivables/${receivableId}/reverse`;
      for (const payload of [undefined, {}, { reason: "   " }]) {
        const refused = await app.inject({
          method: "POST",
          url,
          headers,
          ...(payload ? { payload } : {}),
        });
        expect(refused.statusCode).toBe(400);
        expect(refused.json().message).toContain("Informe o motivo");
      }
      const tooLong = await app.inject({
        method: "POST",
        url,
        headers,
        payload: { reason: "x".repeat(501) },
      });
      expect(tooLong.statusCode).toBe(400);
      expect(tooLong.json().message).toContain("até 500 caracteres");

      const reversed = await app.inject({
        method: "POST",
        url,
        headers,
        payload: { reason: "  Cobrança em duplicidade  " },
      });
      expect(reversed.statusCode).toBe(200);
      expect(reversed.json()).toMatchObject({ status: "open" });
      const [operation] = await history(
        app,
        headers,
        "operation.finance.receivables_reverse",
      );
      expect(operation?.metadata).toMatchObject({
        reason: "Cobrança em duplicidade",
      });
      // O evento do estorno (domínio) também guarda o motivo.
      const reversals = (
        await app.inject({ url: "/history/audit-events", headers })
      )
        .json<AdminAuditPage>()
        .items.filter(
          (item) =>
            item.module === "finance" &&
            item.metadata.reason === "Cobrança em duplicidade",
        );
      expect(reversals.length).toBeGreaterThanOrEqual(1);
    } finally {
      await app.close();
    }
  });

  it("estorno de conta a pagar exige motivo e o mostra no Histórico", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      const workspace = (
        await app.inject({ method: "GET", url: "/finance/workspace", headers })
      ).json<{
        categories: { id: string; kind: string }[];
        costCenters: { id: string }[];
      }>();
      const payable = await app.inject({
        method: "POST",
        url: "/finance/payables",
        headers,
        payload: {
          description: "Conta do estorno com motivo",
          supplier: "Fornecedor",
          categoryId: workspace.categories.find(
            (item) => item.kind === "expense",
          )!.id,
          costCenterId: workspace.costCenters[0]!.id,
          dueDate: saoPauloToday(),
          amountInCents: 4_000,
        },
      });
      expect(payable.statusCode).toBe(201);
      const id = payable.json().id as string;
      const paid = await app.inject({
        method: "POST",
        url: `/finance/payables/${id}/pay`,
        headers,
        payload: { paymentMethod: "pix" },
      });
      expect(paid.statusCode).toBe(200);
      const refused = await app.inject({
        method: "POST",
        url: `/finance/payables/${id}/reverse`,
        headers,
      });
      expect(refused.statusCode).toBe(400);
      expect(refused.json().message).toContain("Informe o motivo");

      const reversed = await app.inject({
        method: "POST",
        url: `/finance/payables/${id}/reverse`,
        headers,
        payload: { reason: "Pago na conta errada" },
      });
      expect(reversed.statusCode).toBe(200);
      expect(reversed.json()).toMatchObject({ status: "open" });
      const [operation] = await history(
        app,
        headers,
        "operation.finance.payables_reverse",
      );
      expect(operation?.metadata).toMatchObject({
        reason: "Pago na conta errada",
      });
    } finally {
      await app.close();
    }
  });

  it("cancelar contrato exige motivo, guarda-o no contrato e no Histórico", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    try {
      const patient = (
        await app.inject({ method: "GET", url: "/patients", headers })
      ).json()[0];
      const template = await app.inject({
        method: "POST",
        url: "/document-templates",
        headers,
        payload: {
          name: "Contrato do cancelamento com motivo",
          kind: "contract",
          body: "Contrato de {{paciente_nome}}.",
        },
      });
      expect(template.statusCode).toBe(201);
      const document = await app.inject({
        method: "POST",
        url: "/documents",
        headers,
        payload: {
          templateId: template.json().id,
          patientId: patient.id,
          title: "Contrato a cancelar",
        },
      });
      expect(document.statusCode).toBe(201);
      const url = `/documents/${document.json().id}/status`;
      // Emitir continua sem motivo.
      const issued = await app.inject({
        method: "PATCH",
        url,
        headers,
        payload: { status: "issued" },
      });
      expect(issued.json()).toMatchObject({ status: "issued" });
      expect(issued.json()).not.toHaveProperty("cancellationReason");

      for (const payload of [
        { status: "cancelled" },
        { status: "cancelled", reason: "" },
        { status: "cancelled", reason: "x".repeat(501) },
      ]) {
        const refused = await app.inject({
          method: "PATCH",
          url,
          headers,
          payload,
        });
        expect(refused.statusCode).toBe(400);
        expect(refused.json().message).toMatch(
          /Informe o motivo|até 500 caracteres/,
        );
      }
      const cancelled = await app.inject({
        method: "PATCH",
        url,
        headers,
        payload: { status: "cancelled", reason: " Cliente desistiu do plano " },
      });
      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.json()).toMatchObject({
        status: "cancelled",
        cancellationReason: "Cliente desistiu do plano",
      });
      // O cancelamento aparece como "Cancelar contrato" (não "Emitir"), com o motivo.
      const [operation] = await history(
        app,
        headers,
        "operation.contracts.cancel",
      );
      expect(operation?.metadata).toMatchObject({
        reason: "Cliente desistiu do plano",
      });
      const [issuedEvent] = await history(
        app,
        headers,
        "operation.contracts.status",
      );
      expect(issuedEvent?.metadata).not.toHaveProperty("reason");
    } finally {
      await app.close();
    }
  });
});
