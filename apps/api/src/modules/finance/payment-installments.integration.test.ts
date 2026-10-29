import type {
  PatientPlan,
  PaymentMethodSettings,
  PaymentReceipt,
  Receivable,
} from "@crm/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { MemoryClinicRepository } from "../../memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function setup() {
  const repository = new MemoryClinicRepository(),
    app = await buildApp({ repository, logger: false });
  apps.push(app);
  const headers = {
    authorization: `Bearer ${app.jwt.sign({ sub: actorId, clinicId, role: "admin" })}`,
  };
  const [service] = await repository.listServices(clinicId),
    [patient] = await repository.listPatients(clinicId);
  const template = async (maxInstallments?: number) =>
    repository.createPlanTemplate(clinicId, actorId, {
      name: `Pacote ${maxInstallments ?? "livre"}`,
      totalValueInCents: 60000,
      kind: "fixed_package",
      services: [
        { serviceId: service!.id, totalSessions: 6, totalValueInCents: 60000 },
      ],
      ...(maxInstallments ? { maxInstallments } : {}),
    });
  const sellPlan = async (
    planTemplateId: string,
    installments: number,
    paymentMethod?: string,
  ) =>
    app.inject({
      method: "POST",
      url: "/plans",
      headers,
      payload: {
        planTemplateId,
        patientId: patient!.id,
        name: "Pacote de seis sessões",
        kind: "fixed_package",
        services: [
          {
            serviceId: service!.id,
            totalSessions: 6,
            totalValueInCents: 60000,
          },
        ],
        validFrom: "2039-06-01",
        totalValueInCents: 60000,
        installments,
        firstDueDate: "2039-06-10",
        ...(paymentMethod ? { paymentMethod } : {}),
      },
    });
  const saveSettings = (methods: unknown[]) =>
    app.inject({
      method: "PUT",
      url: "/admin/payment-methods",
      headers,
      payload: { methods },
    });
  const receivables = async (planId: string) =>
    (await repository.getFinancialSummary(clinicId)).receivables
      .filter((item) => item.planId === planId)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
  return {
    app,
    repository,
    headers,
    patient: patient!,
    template,
    sellPlan,
    saveSettings,
    receivables,
  };
}

describe("payment method installments", () => {
  it("accepts up to 36 installments in every method until the clinic configures", async () => {
    const { app, headers } = await setup();
    const response = await app.inject({
      method: "GET",
      url: "/clinic/payment-methods",
      headers,
    });
    expect(response.statusCode).toBe(200);
    const settings = response.json<PaymentMethodSettings>();
    expect(settings.methods.map((item) => item.method)).toEqual([
      "pix",
      "card",
      "cash",
      "bank_transfer",
      "boleto",
      "other",
    ]);
    expect(
      settings.methods.every(
        (item) => item.acceptsInstallments && item.maxInstallments === 36,
      ),
    ).toBe(true);
  });

  it("saves which methods accept installments and up to how many", async () => {
    const { app, headers, saveSettings } = await setup();
    const saved = await saveSettings([
      { method: "pix", acceptsInstallments: false, maxInstallments: 1 },
      { method: "card", acceptsInstallments: true, maxInstallments: 6 },
    ]);
    expect(saved.statusCode).toBe(200);
    const settings = (
      await app.inject({
        method: "GET",
        url: "/clinic/payment-methods",
        headers,
      })
    ).json<PaymentMethodSettings>();
    expect(settings.methods.slice(0, 3)).toEqual([
      { method: "pix", acceptsInstallments: false, maxInstallments: 1 },
      { method: "card", acceptsInstallments: true, maxInstallments: 6 },
      { method: "cash", acceptsInstallments: true, maxInstallments: 36 },
    ]);
    expect(settings.updatedAt).toBeTruthy();
    // Gravar só uma forma mantém as outras como estavam.
    await saveSettings([
      { method: "cash", acceptsInstallments: false, maxInstallments: 1 },
    ]);
    const again = (
      await app.inject({
        method: "GET",
        url: "/clinic/payment-methods",
        headers,
      })
    ).json<PaymentMethodSettings>();
    expect(again.methods[1]).toEqual({
      method: "card",
      acceptsInstallments: true,
      maxInstallments: 6,
    });
    expect(again.methods[2]!.acceptsInstallments).toBe(false);
    const invalid = await saveSettings([
      { method: "card", acceptsInstallments: true, maxInstallments: 1 },
    ]);
    expect(invalid.statusCode).toBe(400);
  });

  it("limits plan installments by the payment method and by the plan template", async () => {
    const { template, sellPlan, saveSettings } = await setup();
    await saveSettings([
      { method: "pix", acceptsInstallments: false, maxInstallments: 1 },
      { method: "card", acceptsInstallments: true, maxInstallments: 6 },
    ]);
    const free = await template();
    const tooMany = await sellPlan(free.id, 8, "card");
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json()).toMatchObject({
      code: "INSTALLMENTS_NOT_ALLOWED",
      message: "Cartão aceita no máximo 6 parcelas.",
    });
    const pix = await sellPlan(free.id, 2, "pix");
    expect(pix.json().message).toBe(
      "Pix não aceita parcelamento: use 1 parcela.",
    );
    expect((await sellPlan(free.id, 1, "pix")).statusCode).toBe(201);
    expect((await sellPlan(free.id, 6, "card")).statusCode).toBe(201);
    // "A combinar": vale só o limite do plano.
    expect((await sellPlan(free.id, 12)).statusCode).toBe(201);

    const upToThree = await template(3);
    expect(upToThree.maxInstallments).toBe(3);
    const overTemplate = await sellPlan(upToThree.id, 4, "card");
    expect(overTemplate.json().message).toBe(
      "Este plano aceita no máximo 3 parcelas.",
    );
    expect((await sellPlan(upToThree.id, 4)).statusCode).toBe(400);
    const cashOnly = await template(1);
    expect((await sellPlan(cashOnly.id, 2, "card")).json().message).toBe(
      "Este plano não aceita parcelamento: use 1 parcela.",
    );
  });

  it("removes the template limit when it is cleared", async () => {
    const { app, headers, template, sellPlan } = await setup();
    const limited = await template(2);
    const cleared = await app.inject({
      method: "PATCH",
      url: `/plan-templates/${limited.id}`,
      headers,
      payload: { maxInstallments: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().maxInstallments).toBeUndefined();
    expect((await sellPlan(limited.id, 5, "card")).statusCode).toBe(201);
  });

  it("shows which plan installments were paid and records card installments on payment", async () => {
    const { app, headers, template, sellPlan, saveSettings, receivables } =
      await setup();
    await saveSettings([
      { method: "pix", acceptsInstallments: false, maxInstallments: 1 },
      { method: "card", acceptsInstallments: true, maxInstallments: 6 },
    ]);
    const sold = await sellPlan((await template()).id, 3, "boleto");
    const plan = sold.json<PatientPlan>();
    const [first, second] = await receivables(plan.id);
    expect(first!.description).toBe("Pacote livre · 1/3");

    const pixInParts = await app.inject({
      method: "POST",
      url: `/finance/receivables/${first!.id}/pay`,
      headers,
      payload: { paymentMethod: "pix", paymentInstallments: 2 },
    });
    expect(pixInParts.statusCode).toBe(400);
    const paid = await app.inject({
      method: "POST",
      url: `/finance/receivables/${first!.id}/pay`,
      headers,
      payload: { paymentMethod: "card", paymentInstallments: 3 },
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json<Receivable>()).toMatchObject({
      status: "paid",
      paymentMethod: "card",
      paymentInstallments: 3,
    });
    const receipt = (
      await app.inject({
        method: "GET",
        url: `/finance/receivables/${first!.id}/receipt`,
        headers,
      })
    ).json<PaymentReceipt>();
    expect(receipt).toMatchObject({
      paymentMethod: "card",
      paymentInstallments: 3,
      installmentNumber: 1,
      installmentCount: 3,
    });
    await app.inject({
      method: "POST",
      url: `/finance/receivables/${second!.id}/pay`,
      headers,
      payload: { paymentMethod: "pix" },
    });

    const listed = (
      await app.inject({ method: "GET", url: "/plans", headers })
    ).json<PatientPlan[]>();
    expect(listed.find((item) => item.id === plan.id)?.paymentSummary).toEqual({
      installmentCount: 3,
      paidCount: 2,
      openCount: 1,
      overdueCount: 0,
      paidInCents: 40000,
      openInCents: 20000,
    });

    // Estorno apaga as parcelas do cartão junto com a forma.
    const reversed = await app.inject({
      method: "POST",
      url: `/finance/receivables/${first!.id}/reverse`,
      headers,
    });
    expect(reversed.json<Receivable>().paymentInstallments).toBeUndefined();
  });

  it("records card installments in a paid product sale and ignores them when billed later", async () => {
    const { app, headers, repository, patient, saveSettings } = await setup();
    await saveSettings([
      { method: "card", acceptsInstallments: true, maxInstallments: 4 },
    ]);
    const product = await repository.createProduct(clinicId, actorId, {
      name: "Creme",
      sku: "CRM-1",
      unit: "un",
      costInCents: 2000,
      salePriceInCents: 4500,
      initialStock: 5,
    });
    const sale = (body: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: "/product-sales",
        headers,
        payload: {
          patientId: patient.id,
          items: [{ productId: product.id, quantity: 1 }],
          dueDate: "2039-06-10",
          ...body,
        },
      });
    const over = await sale({
      settlement: "paid",
      paymentMethod: "card",
      paymentInstallments: 5,
    });
    expect(over.statusCode).toBe(400);
    expect(over.json().message).toBe("Cartão aceita no máximo 4 parcelas.");
    const paid = await sale({
      settlement: "paid",
      paymentMethod: "card",
      paymentInstallments: 4,
    });
    expect(paid.statusCode).toBe(201);
    const later = await sale({
      settlement: "receivable",
      paymentInstallments: 4,
    });
    expect(later.statusCode).toBe(201);
    const all = (await repository.getFinancialSummary(clinicId)).receivables;
    expect(
      all.find((item) => item.id === paid.json().receivableId)
        ?.paymentInstallments,
    ).toBe(4);
    expect(
      all.find((item) => item.id === later.json().receivableId)
        ?.paymentInstallments,
    ).toBeUndefined();
  });
});
