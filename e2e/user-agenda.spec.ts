import {
  test,
  expect,
  login,
  seedPatient,
  seedPatientPlan,
} from "./fixtures.js";

test("cadastro do usuário controla o profissional da agenda e preserva atendimentos", async ({
  page,
  api,
}, testInfo) => {
  await login(page);
  await page.goto("/configuracoes");
  await page.getByRole("tab", { name: "Usuários", exact: true }).click();
  await page.getByRole("button", { name: "Novo usuário", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Novo usuário", exact: true });
  await dialog.getByLabel("Nome completo", { exact: true }).fill("Ana Souza");
  await dialog.getByLabel("E-mail de acesso").fill("ana.agenda@example.com");
  await dialog.getByLabel("Senha inicial").fill("Senha123");
  await dialog.getByLabel("Realiza atendimentos").check();
  await expect(dialog.getByLabel("Nome na agenda")).toHaveValue("Ana Souza");
  await dialog.getByLabel("Nome na agenda").fill("Dra. Ana Agenda");
  await dialog.getByLabel("Registro profissional").fill("CREFITO-12345");
  await dialog.getByLabel("Especialidade").fill("Pilates");
  await dialog.getByLabel("Cor", { exact: true }).fill("#336699");
  await dialog.getByLabel("Nome na agenda").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("cadastro-unificado.png"),
  });
  await dialog
    .getByRole("button", { name: "Criar usuário", exact: true })
    .click();
  await expect(
    page.getByText("Usuário Ana Souza criado.", { exact: true }),
  ).toBeVisible();
  const users = await (await api.get("/admin/users")).json();
  const user = users.find(
    (item: { email: string }) => item.email === "ana.agenda@example.com",
  );
  const professionalId = user.professional.id;
  expect(user.permissions).toEqual([]);

  await page.goto("/agenda");
  await page
    .getByRole("button", { name: "Novo atendimento", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Novo atendimento", exact: true });
  await expect(
    dialog
      .getByRole("combobox", { name: "Profissional", exact: true })
      .locator("option", { hasText: "Dra. Ana Agenda" }),
  ).toHaveCount(1);
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  const patient = await seedPatient(api, "Cliente da Ana");
  const serviceResponse = await api.post("/services", {
    data: {
      name: "Serviço da Ana",
      durationMinutes: 60,
    },
  });
  expect(serviceResponse.status()).toBe(201);
  const service = await serviceResponse.json();
  const [room] = await (await api.get("/rooms")).json();
  const startsAt = new Date();
  startsAt.setUTCDate(startsAt.getUTCDate() + 10);
  startsAt.setUTCHours(14, 0, 0, 0);
  const plan = await seedPatientPlan(api, patient.id, service.id);
  const appointmentResponse = await api.post("/appointments", {
    data: {
      patientId: patient.id,
      planId: plan.id,
      professionalId,
      serviceId: service.id,
      roomId: room.id,
      startsAt: startsAt.toISOString(),
    },
  });
  expect(appointmentResponse.status()).toBe(201);
  const appointment = await appointmentResponse.json();

  async function edit() {
    await page.goto("/configuracoes");
    await page.getByRole("tab", { name: "Usuários", exact: true }).click();
    await page
      .getByRole("button", { name: "Editar Ana Souza", exact: true })
      .click();
    return page.getByRole("dialog", { name: "Editar Ana Souza", exact: true });
  }
  dialog = await edit();
  await dialog.getByLabel("Nome na agenda").fill("Ana Pilates");
  await dialog.getByLabel("Cor", { exact: true }).fill("#112233");
  await dialog
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(
    page.getByText("Alterações de Ana Souza salvas.", { exact: true }),
  ).toBeVisible();
  dialog = await edit();
  await dialog.getByLabel("Realiza atendimentos").uncheck();
  await dialog
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(
    page.getByText("Agenda: Ana Pilates (inativo) · Sem comissão vigente", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await (await api.get("/professionals")).json()).some(
      (item: { id: string }) => item.id === professionalId,
    ),
  ).toBe(false);
  const appointments = await (
    await api.get(
      `/appointments?from=${startsAt.toISOString()}&to=${new Date(+startsAt + 86400000).toISOString()}`,
    )
  ).json();
  expect(
    appointments.find((item: { id: string }) => item.id === appointment.id),
  ).toMatchObject({
    professionalId,
    professionalName: "Ana Pilates",
    professionalColor: "#112233",
  });
  dialog = await edit();
  await dialog.getByLabel("Realiza atendimentos").check();
  await expect(dialog.getByLabel("Nome na agenda")).toHaveValue("Ana Pilates");
  await dialog
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(
    page.getByText("Alterações de Ana Souza salvas.", { exact: true }),
  ).toBeVisible();
  expect(
    (await (await api.get("/professionals")).json()).filter(
      (item: { id: string }) => item.id === professionalId,
    ),
  ).toHaveLength(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
