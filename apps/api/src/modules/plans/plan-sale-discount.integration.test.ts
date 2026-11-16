import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../test-support/cpf.js";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

const tenPercent = {
  type: "percentage",
  percent: 10,
  scope: "permanent",
} as const;

// Contratação pela ficha (RE15): o plano vendido em "3x com 10%" leva o desconto às
// parcelas e ao Financeiro, igual ao cadastro guiado — pelas duas rotas que a ficha usa.
describe("plan sale discount from the client record", () => {
  it("applies the discount to the installments of /plans and /plans/purchases", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const serviceId = (
      await app.inject({ method: "GET", url: "/services", headers })
    ).json()[0].id as string;
    const patient = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Cliente Desconto Ficha",
          phone: "11955553333",
          whatsapp: "11955553333",
          emergencyContactName: "Cliente Desconto Ficha",
          emergencyContactPhone: "11955553333",
          emergencyContactWhatsapp: "11955553333",
          tags: [],
        },
      })
    ).json<{ id: string }>();
    const plan = (name: string) =>
      configuredPlan(app, {
        patientId: patient.id,
        serviceId,
        name,
        kind: "fixed_package",
        totalSessions: 3,
        validFrom: "2039-06-01",
        validUntil: "2039-06-30",
        totalValueInCents: 30_000,
        installments: 3,
        firstDueDate: "2039-06-10",
      });
    const charges = async (planId: string) =>
      (
        (
          await app.inject({
            method: "GET",
            url: "/finance/workspace",
            headers,
          })
        ).json().summary.receivables as {
          planId?: string;
          installmentNumber: number;
          amountInCents: number;
          customerDiscountInCents?: number;
        }[]
      )
        .filter((item) => item.planId === planId)
        .sort((a, b) => a.installmentNumber - b.installmentNumber)
        .map((item) => [item.amountInCents, item.customerDiscountInCents]);
    const discounted = [
      [9_000, 1_000],
      [9_000, 1_000],
      [9_000, 1_000],
    ];

    const created = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: { ...(await plan("Pacote ficha")), discount: tenPercent },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json().discount).toEqual({ ...tenPercent, usedCharges: 3 });
    expect(await charges(created.json().id)).toEqual(discounted);

    const purchased = await app.inject({
      method: "POST",
      url: "/plans/purchases",
      headers,
      payload: {
        idempotencyKey: randomUUID(),
        plan: { ...(await plan("Pacote ficha compra")), discount: tenPercent },
      },
    });
    expect(purchased.statusCode, purchased.body).toBe(201);
    expect(purchased.json().plan.discount).toEqual({
      ...tenPercent,
      usedCharges: 3,
    });
    expect(await charges(purchased.json().plan.id)).toEqual(discounted);

    // Sem desconto, nada muda: as três parcelas cheias.
    const plain = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await plan("Pacote ficha cheio"),
    });
    expect(plain.statusCode, plain.body).toBe(201);
    expect(plain.json().discount).toBeUndefined();
    expect(await charges(plain.json().id)).toEqual([
      [10_000, undefined],
      [10_000, undefined],
      [10_000, undefined],
    ]);
    await app.close();
  });
});
