import { nextTestCpf } from "../../test-support/cpf.js";
import { describe, expect, it } from "vitest";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

const percent = (value: number) =>
  ({ type: "percentage", percent: value, scope: "permanent" }) as const;

describe("plan discount", () => {
  it("saves a percentage or amount discount and removes it with null", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const base = {
      cpf: nextTestCpf(),
      fullName: "Cliente com Desconto",
      phone: "11955552222",
      whatsapp: "11955552222",
      emergencyContactName: "Cliente com Desconto",
      emergencyContactPhone: "11955552222",
      emergencyContactWhatsapp: "11955552222",
      tags: [],
    };
    const created = await app.inject({
      method: "POST",
      url: "/patients",
      headers,
      // A tela não define quantas cobranças já usaram o desconto.
      payload: { ...base, discount: { ...percent(10), usedCharges: 5 } },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<{ id: string }>().id;
    expect(created.json().discount).toEqual(percent(10));

    const kept = await app.inject({
      method: "PUT",
      url: `/patients/${id}`,
      headers,
      payload: base,
    });
    expect(kept.json().discount).toEqual(percent(10));

    const amount = await app.inject({
      method: "PUT",
      url: `/patients/${id}`,
      headers,
      payload: {
        ...base,
        discount: { type: "amount", amountInCents: 3000, scope: "once" },
      },
    });
    expect(amount.json().discount).toEqual({
      type: "amount",
      amountInCents: 3000,
      scope: "once",
    });

    const removed = await app.inject({
      method: "PUT",
      url: `/patients/${id}`,
      headers,
      payload: { ...base, discount: null },
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().discount).toBeNull();
    await app.close();
  });

  it("applies the plan discount only to that plan and its renewals", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const services = await app.inject({
      method: "GET",
      url: "/services",
      headers,
    });
    const nextTwo = {
      type: "percentage",
      percent: 10,
      scope: "next",
      charges: 2,
    } as const;
    const patient = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Cliente Desconto Parcelas",
          phone: "11955554444",
          whatsapp: "11955554444",
          emergencyContactName: "Cliente Desconto Parcelas",
          emergencyContactPhone: "11955554444",
          emergencyContactWhatsapp: "11955554444",
          tags: [],
        },
      })
    ).json<{ id: string }>();
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
    const sell = async (extra: Record<string, unknown>) => {
      const plan = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: {
          ...(await configuredPlan(app, {
            patientId: patient.id,
            serviceId: services.json()[0].id as string,
            name: "Pacote com desconto",
            kind: "fixed_package",
            totalSessions: 3,
            validFrom: "2039-06-01",
            validUntil: "2039-06-30",
            totalValueInCents: 30_000,
            installments: 1,
            firstDueDate: "2039-06-10",
          })),
          ...extra,
        },
      });
      expect(plan.statusCode, plan.body).toBe(201);
      return plan.json<{ id: string; discount?: unknown }>();
    };

    // 1ª venda em 1 parcela: usa 1 das 2 cobranças; o uso enviado pela tela é ignorado.
    const first = await sell({ discount: { ...nextTwo, usedCharges: 5 } });
    expect(await charges(first.id)).toEqual([[27_000, 3_000]]);
    expect(first.discount).toEqual({ ...nextTwo, usedCharges: 1 });
    // Outro plano do mesmo cliente, sem desconto, não ganha o desconto do primeiro.
    const other = await sell({});
    expect(await charges(other.id)).toEqual([[30_000, undefined]]);
    expect(other.discount).toBeUndefined();

    // A renovação segue o desconto do plano: só a 1ª parcela ainda tem desconto.
    const renewed = await app.inject({
      method: "POST",
      url: `/plans/${first.id}/renew`,
      headers,
      payload: {
        name: "Pacote com desconto",
        services: [
          {
            serviceId: services.json()[0].id as string,
            totalSessions: 3,
            totalValueInCents: 30_000,
          },
        ],
        validFrom: "2039-07-01",
        validUntil: "2039-07-31",
        totalValueInCents: 30_000,
        installments: 3,
        firstDueDate: "2039-07-10",
      },
    });
    expect(renewed.statusCode, renewed.body).toBe(201);
    expect(await charges(renewed.json().id)).toEqual([
      [9_000, 1_000],
      [10_000, undefined],
      [10_000, undefined],
    ]);
    expect(renewed.json().discount).toEqual({ ...nextTwo, usedCharges: 2 });

    // Parte do desconto geral do pedido: abate da 1ª cobrança em diante e não fica no plano.
    const order = await sell({ installments: 3, orderDiscountInCents: 12_000 });
    expect(await charges(order.id)).toEqual([
      [0, 10_000],
      [8_000, 2_000],
      [10_000, undefined],
    ]);
    expect(order).not.toHaveProperty("orderDiscountInCents");
    await app.close();
  });

  it("shows the plan discount in the reports and in the receipt", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const services = await app.inject({
      method: "GET",
      url: "/services",
      headers,
    });
    const patient = (
      await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Cliente Relatório Desconto",
          phone: "11955556666",
          whatsapp: "11955556666",
          emergencyContactName: "Cliente Relatório Desconto",
          emergencyContactPhone: "11955556666",
          emergencyContactWhatsapp: "11955556666",
          tags: [],
        },
      })
    ).json<{ id: string }>();
    const today = new Date().toISOString().slice(0, 10);
    const plan = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: {
        ...(await configuredPlan(app, {
          patientId: patient.id,
          serviceId: services.json()[0].id as string,
          name: "Plano do relatório",
          kind: "fixed_package",
          totalSessions: 2,
          validFrom: today,
          totalValueInCents: 20_000,
          installments: 1,
          firstDueDate: today,
        })),
        discount: { type: "amount", amountInCents: 5_000, scope: "once" },
      },
    });
    expect(plan.statusCode, plan.body).toBe(201);
    const receivable = (
      (
        await app.inject({ method: "GET", url: "/finance/workspace", headers })
      ).json().summary.receivables as {
        id: string;
        planId?: string;
        amountInCents: number;
        customerDiscountInCents?: number;
      }[]
    ).find((item) => item.planId === plan.json().id)!;
    expect(receivable).toMatchObject({
      amountInCents: 15_000,
      customerDiscountInCents: 5_000,
    });

    const month = today.slice(0, 7);
    const range = `from=${month}-01&to=${today}`;
    const dre = (
      await app.inject({ method: "GET", url: `/reports/dre?${range}`, headers })
    ).json();
    expect(dre.totals.customerDiscountInCents).toBeGreaterThanOrEqual(5_000);

    const sales = (
      await app.inject({
        method: "GET",
        url: `/reports/sales/period?${range}`,
        headers,
      })
    ).json();
    expect(
      sales.sales.find(
        (item: { sourceId: string }) => item.sourceId === plan.json().id,
      ),
    ).toMatchObject({ amountInCents: 20_000, customerDiscountInCents: 5_000 });
    expect(sales.summary.customerDiscountInCents).toBeGreaterThanOrEqual(5_000);

    const clients = (
      await app.inject({
        method: "GET",
        url: `/reports/clients/details?${range}&discount=with&columns=fullName,discount,discountGranted`,
        headers,
      })
    ).json();
    expect(clients.rows).toContainEqual({
      id: patient.id,
      values: {
        fullName: "Cliente Relatório Desconto",
        discount:
          "Plano do relatório: R$ 50,00 de desconto · já usado no pagamento",
        discountGranted: "R$ 50,00",
      },
    });
    const without = (
      await app.inject({
        method: "GET",
        url: `/reports/clients/details?${range}&discount=without&columns=fullName`,
        headers,
      })
    ).json();
    expect(
      without.rows.some((row: { id: string }) => row.id === patient.id),
    ).toBe(false);

    await app.inject({
      method: "POST",
      url: `/finance/receivables/${receivable.id}/pay`,
      headers,
      payload: { paymentMethod: "pix" },
    });
    const receipt = await app.inject({
      method: "GET",
      url: `/finance/receivables/${receivable.id}/receipt`,
      headers,
    });
    expect(receipt.json()).toMatchObject({
      amountInCents: 15_000,
      customerDiscountInCents: 5_000,
    });
    await app.close();
  });

  it("rejects an invalid discount", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    for (const discount of [
      percent(120),
      percent(0),
      { type: "amount", amountInCents: -100, scope: "permanent" },
      { type: "other", percent: 10, scope: "permanent" },
      { type: "percentage", percent: 10 },
      { ...percent(10), scope: "next" },
      { ...percent(10), scope: "sempre" },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/patients",
        headers,
        payload: {
          cpf: nextTestCpf(),
          fullName: "Cliente Inválido",
          phone: "11955553333",
          whatsapp: "11955553333",
          emergencyContactName: "Cliente Inválido",
          emergencyContactPhone: "11955553333",
          emergencyContactWhatsapp: "11955553333",
          tags: [],
          discount,
        },
      });
      expect(response.statusCode, JSON.stringify(discount)).toBe(400);
    }
    await app.close();
  });
});
