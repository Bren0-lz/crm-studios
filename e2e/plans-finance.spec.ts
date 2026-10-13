import {
  test,
  expect,
  login,
  seedPatient,
  selectPatient,
  clinicToday,
} from "./fixtures.js";

test("sells a configured plan and records a payment from the financial screen", async ({
  page,
  api,
}) => {
  const patient = await seedPatient(api, "Cliente Plano Navegador");
  const services = await (await api.get("/services")).json();
  const templateResponse = await api.post("/plan-templates", {
    data: {
      name: "Pacote Navegador",
      kind: "fixed_package",
      totalValueInCents: 20000,
      services: [
        {
          serviceId: services[0].id,
          totalSessions: 4,
          totalValueInCents: 20000,
        },
      ],
    },
  });
  expect(templateResponse.status()).toBe(201);
  const template = await templateResponse.json();
  await login(page);
  await page.goto("/planos");
  await page.getByRole("button", { name: "Novo plano", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await selectPatient(dialog, patient.fullName);
  await dialog
    .getByRole("combobox", { name: "Plano cadastrado", exact: true })
    .selectOption(template.id);
  await dialog.getByLabel("Parcelas", { exact: true }).fill("1");
  await dialog
    .getByLabel("Primeiro vencimento", { exact: true })
    .fill(clinicToday());
  await dialog
    .getByRole("button", { name: "Criar plano e parcelas", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const plans = await (await api.get(`/plans?patientId=${patient.id}`)).json();
  expect(plans).toHaveLength(1);
  expect(plans[0]).toMatchObject({
    totalValueInCents: 20000,
    remainingSessions: 4,
  });
  await page.goto("/financeiro");
  const row = page
    .locator(".finance-row")
    .filter({ hasText: patient.fullName });
  await row.getByRole("button", { name: "Dar baixa", exact: true }).click();
  const payment = page.getByRole("dialog", {
    name: "Dar baixa na parcela",
    exact: true,
  });
  await payment
    .getByRole("combobox", { name: "Forma de pagamento recebida", exact: true })
    .selectOption("pix");
  await payment
    .getByRole("button", { name: "Confirmar baixa", exact: true })
    .click();
  await expect(payment).toHaveCount(0);
  await expect(row).toContainText("Paga");
  const workspace = await (await api.get("/finance/workspace")).json();
  expect(
    workspace.summary.receivables.filter(
      (item: { patientId: string }) => item.patientId === patient.id,
    ),
  ).toEqual([
    expect.objectContaining({ status: "paid", paymentMethod: "pix" }),
  ]);
});
