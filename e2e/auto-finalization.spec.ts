import {
  test,
  expect,
  login,
  seedPatient,
  seedPatientPlan,
  clinicToday,
} from "./fixtures.js";

test("auto finalization completes past appointments and lists them by period", async ({
  page,
  api,
}) => {
  const patient = await seedPatient(api, "Cliente Finalização Automática");
  const services = await (await api.get("/services")).json();
  const professionals = await (await api.get("/professionals")).json();
  const rooms = await (await api.get("/rooms")).json();
  // Ontem, no fuso da clínica: o atendimento já terminou a qualquer hora do dia.
  const [year, month, day] = clinicToday().split("-").map(Number);
  const yesterday = new Date(Date.UTC(year!, month! - 1, day! - 1))
    .toISOString()
    .slice(0, 10);
  const plan = await seedPatientPlan(api, patient.id, services[0].id);
  const created = await api.post("/appointments", {
    data: {
      patientId: patient.id,
      planId: plan.id,
      serviceId: services[0].id,
      professionalId: professionals[0].id,
      roomId: rooms[0].id,
      startsAt: `${yesterday}T10:00:00-03:00`,
    },
  });
  expect(created.status(), await created.text()).toBe(201);

  await login(page);
  await page.goto("/configuracoes?secao=finalizacao");
  const panel = page.getByRole("tabpanel", { name: "Finalização automática" });
  await panel
    .getByLabel("Finalizar atendimentos automaticamente", { exact: true })
    .check();
  await panel.getByLabel("Tempo de espera após o término").fill("15");
  await panel.getByLabel("Unidade").selectOption("minutes");
  await panel
    .getByRole("button", { name: "Salvar finalização automática" })
    .click();
  await expect(panel.getByText("Finalização automática ligada.")).toBeVisible();

  await panel
    .getByRole("link", { name: "Ver atendimentos concluídos" })
    .click();
  await expect(page).toHaveURL(/\/agenda\/concluidos$/);
  // Padrão: últimos 7 dias, que incluem ontem.
  const row = page.locator("li", { hasText: patient.fullName });
  await expect(
    row.getByText("Finalização automática", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Resumo do período").getByRole("article").first(),
  ).toContainText("Concluídos");
  // Sem rolagem horizontal da página, também no celular.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.goto("/agenda");
  await expect(page.getByRole("link", { name: "Concluídos" })).toHaveAttribute(
    "href",
    "/agenda/concluidos",
  );
});
