import { nextTestCpf } from "../../test-support/cpf.js";
import { describe, expect, it } from "vitest";
import {
  authenticatedApp,
  configuredPlan,
} from "../../test-support/legacy-fixtures.js";
import "../../test-support/legacy-setup.js";

const percent = (value: number) =>
  ({ type: "percentage", percent: value, scope: "permanent" }) as const;

describe("client discount", () => {
  it("saves a percentage or amount discount and removes it with null", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const base = {
      cpf: nextTestCpf(),
      fullName: "Cliente com Desconto",
      phone: "11955552222",
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

  it("applies the discount to the plan charges while the scope allows", async () => {
    const { app, token } = await authenticatedApp();
    const headers = { authorization: `Bearer ${token}` };
    const [services] = await Promise.all([
      app.inject({ method: "GET", url: "/services", headers }),
    ]);
    const base = {
      cpf: nextTestCpf(),
      fullName: "Cliente Desconto Parcelas",
      phone: "11955554444",
      tags: [],
    };
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
        payload: { ...base, discount: nextTwo },
      })
    ).json<{ id: string }>();
    const sell = async (installments: number) => {
      const plan = await app.inject({
        method: "POST",
        url: "/plans",
        headers,
        payload: await configuredPlan(app, {
          patientId: patient.id,
          serviceId: services!.json()[0].id as string,
          name: "Pacote com desconto",
          kind: "fixed_package",
          totalSessions: 3,
          validFrom: "2039-06-01",
          totalValueInCents: 30_000,
          installments,
          firstDueDate: "2039-06-10",
        }),
      });
      expect(plan.statusCode, plan.body).toBe(201);
      return (
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
        .filter((item) => item.planId === plan.json().id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber)
        .map((item) => [item.amountInCents, item.customerDiscountInCents]);
    };
    const current = async () =>
      (
        await app.inject({
          method: "GET",
          url: `/patients/${patient.id}`,
          headers,
        })
      ).json().discount;

    // 1ª venda em 1 parcela: usa 1 das 2 cobranças.
    expect(await sell(1)).toEqual([[27_000, 3_000]]);
    expect(await current()).toEqual({ ...nextTwo, usedCharges: 1 });
    // Editar o cliente sem mexer no desconto mantém o uso.
    await app.inject({
      method: "PUT",
      url: `/patients/${patient.id}`,
      headers,
      payload: { ...base, discount: { ...nextTwo, usedCharges: 0 } },
    });
    expect(await current()).toEqual({ ...nextTwo, usedCharges: 1 });
    // 2ª venda em 3 parcelas: só a primeira ainda tem desconto.
    expect(await sell(3)).toEqual([
      [9_000, 1_000],
      [10_000, undefined],
      [10_000, undefined],
    ]);
    expect(await current()).toEqual({ ...nextTwo, usedCharges: 2 });
    expect(await sell(1)).toEqual([[30_000, undefined]]);
    // Desconto novo começa a contar do zero.
    await app.inject({
      method: "PUT",
      url: `/patients/${patient.id}`,
      headers,
      payload: { ...base, discount: { ...nextTwo, charges: 4 } },
    });
    expect(await current()).toEqual({ ...nextTwo, charges: 4 });
    await app.close();
  });

  it("shows the client discount in the reports and in the receipt", async () => {
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
          tags: [],
          discount: { type: "amount", amountInCents: 5_000, scope: "once" },
        },
      })
    ).json<{ id: string }>();
    const today = new Date().toISOString().slice(0, 10);
    const plan = await app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: await configuredPlan(app, {
        patientId: patient.id,
        serviceId: services.json()[0].id as string,
        name: "Plano do relatório",
        kind: "fixed_package",
        totalSessions: 2,
        validFrom: today,
        totalValueInCents: 20_000,
        installments: 1,
        firstDueDate: today,
      }),
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
        discount: "R$ 50,00 de desconto · já usado no pagamento",
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
          tags: [],
          discount,
        },
      });
      expect(response.statusCode, JSON.stringify(discount)).toBe(400);
    }
    await app.close();
  });
});
