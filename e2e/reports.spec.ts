import { test, expect, login, seedPatient, clinicToday } from "./fixtures.js";

test("reports share a custom period across tabs, charts and downloads", async ({
  page,
  api,
}, testInfo) => {
  const patient = await seedPatient(api, "Cliente Relatórios Navegador");
  const services = await (await api.get("/services")).json();
  const today = clinicToday();
  const composition = [
    { serviceId: services[0].id, totalSessions: 4, totalValueInCents: 120000 },
  ];
  const templateResponse = await api.post("/plan-templates", {
    data: {
      name: "Plano para relatórios",
      kind: "fixed_package",
      totalValueInCents: 120000,
      services: composition,
    },
  });
  expect(templateResponse.status()).toBe(201);
  const template = await templateResponse.json();
  const plan = await api.post("/plans", {
    data: {
      patientId: patient.id,
      planTemplateId: template.id,
      name: template.name,
      kind: "fixed_package",
      services: composition,
      totalValueInCents: 120000,
      installments: 1,
      validFrom: new Date(Date.parse(today + "T12:00:00Z") - 32 * 86400000)
        .toISOString()
        .slice(0, 10),
      firstDueDate: today,
    },
  });
  expect(plan.status()).toBe(201);
  await login(page);
  await page.goto("/relatorios");
  await expect(
    page.getByRole("tab", { name: "Visão geral", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByText("Vendido líquido", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("De", { exact: true }).fill(today);
  await page.getByLabel("Até", { exact: true }).fill(today);
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  const sales = page.locator(".reports-sales");
  await expect(
    sales.getByRole("group", {
      name: "Vendas líquidas e recebimentos no período",
      exact: true,
    }),
  ).toBeVisible();
  await expect(sales.locator(".reports-kpis article").first()).toContainText(
    "1.200,00",
  );
  await expect(
    sales.getByText(/Comparação mensal|frente ao mês anterior/),
  ).toHaveCount(0);
  const point = sales.locator(".report-chart-point").first();
  await point.focus();
  await expect(sales.locator(".report-chart-readout")).toContainText(
    "1.200,00",
  );
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: testInfo.outputPath("reports-overview.png"),
    fullPage: true,
  });
  const downloadEvent = page.waitForEvent("download");
  await sales.getByRole("button", { name: "Exportar Excel detalhado" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`vendas-${today}-${today}.xlsx`);
  await page.getByRole("tab", { name: "Clientes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Retenção mês a mês", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", {
      name: "Evolução da retenção mensal",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "Consulta de clientes", exact: true })
    .click();
  const search = page.getByLabel("Buscar cliente", { exact: true });
  await search.fill(patient.fullName);
  await page
    .getByRole("button", { name: "Consultar clientes", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: patient.fullName, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("reports-clients.png"),
    fullPage: true,
  });
  await page.getByRole("tab", { name: "DRE", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "DRE por competência", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Resultado por competência", exact: true }),
  ).toBeVisible();
  const dreDownloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar DRE", exact: true }).click();
  expect((await dreDownloadEvent).suggestedFilename()).toBe(
    `dre-${today}-${today}.xlsx`,
  );
  await page.screenshot({
    path: testInfo.outputPath("reports-dre.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("tab", { name: "Clientes", exact: true }).click();
  await expect(search).toHaveValue(patient.fullName);
  await page.goto("/relatorios?secao=sem-retorno");
  await expect(
    page.getByRole("tab", { name: "Clientes", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Clientes sem retorno", exact: true }),
  ).toBeVisible();
});
