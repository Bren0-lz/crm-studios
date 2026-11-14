import {
  test,
  expect,
  login,
  seedPatient,
  seedPatientPlan,
} from "./fixtures.js";

test("contracted history becomes stacked cards on mobile, without side scroll", async ({
  page,
  api,
  apiServer,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Cartões só no celular.");
  const name = "Cliente Histórico Celular";
  const patient = await seedPatient(api, name);
  const services = await (await api.get("/services")).json();
  await seedPatientPlan(api, patient.id, services[0].id);
  // O "Sem retorno" depende de atendimento concluído semanas atrás: a lista vem da resposta
  // real do relatório com este cliente acrescentado; o histórico é o real (venda do plano).
  await page.route("**/api/reports/sales/period?*", async (route) => {
    const incoming = new URL(route.request().url());
    const response = await route.fetch({
      url: `${apiServer.url}${incoming.pathname.slice(4)}${incoming.search}`,
    });
    const body = await response.json();
    await route.fulfill({
      response,
      json: {
        ...body,
        patientsWithoutReturn: [
          {
            patientId: patient.id,
            patientName: name,
            lastCompletedAt: new Date(
              Date.now() - 20 * 86_400_000,
            ).toISOString(),
          },
        ],
      },
    });
  });
  await login(page);
  await page.goto("/relatorios?secao=sem-retorno");
  await page.getByRole("button", { name: `Histórico de ${name}` }).click();
  const dialog = page.getByRole("dialog", {
    name: "Histórico de contratações",
  });
  const table = dialog.getByRole("table");
  await expect(table).toBeVisible();
  // RV6: cada linha mostra o rótulo ao lado do valor; nada pede rolagem lateral.
  const row = table.locator("tbody tr").first();
  for (const label of ["Data", "Tipo", "Movimento", "Valor"])
    expect(
      await row
        .locator(`td[data-label="${label}"]`)
        .evaluate((cell) => getComputedStyle(cell, "::before").content),
    ).toBe(`"${label}"`);
  await expect(row.locator('td[data-label="Valor"]')).toBeInViewport({
    ratio: 1,
  });
  expect(
    await dialog
      .locator(".table-scroll")
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
});
