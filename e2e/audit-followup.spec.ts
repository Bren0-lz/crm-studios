import { expect, login, seedPatient, test } from "./fixtures.js";

test("inativa somente os clientes selecionados que continuam elegíveis", async ({
  api,
  apiServer,
  page,
}) => {
  const selected = await seedPatient(api, "Cliente Alfa do lote");
  const skipped = await seedPatient(api, "Cliente Beta do lote");
  const untouched = await seedPatient(api, "Cliente Gama do lote");
  const recent = await seedPatient(api, "Cliente Recente do lote");
  const oldIds = [selected.id, skipped.id, untouched.id];
  const twoYearsAgo = new Date();
  twoYearsAgo.setUTCFullYear(twoYearsAgo.getUTCFullYear() - 2);
  for (const patient of apiServer.repository["context"].patients) {
    if (oldIds.includes(patient.id))
      patient.createdAt = twoYearsAgo.toISOString();
  }

  await login(page);
  await page.goto("/clientes");
  const more = page.getByRole("button", { name: "Mais", exact: true });
  await more.click();
  await page.getByRole("menuitem", { name: "Inativar em lote" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Inativar clientes em lote",
  });
  const preview = dialog.getByRole("button", { name: "Ver prévia" });
  const confirm = dialog.getByRole("button", { name: "Confirmar inativação" });
  const months = dialog.getByLabel("Meses sem atividade");
  await expect(confirm).toBeDisabled();
  await months.fill("120");
  await preview.click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Nenhum cliente elegível para o período informado.",
  );
  await expect(confirm).toBeDisabled();
  await months.fill("12");
  await preview.click();
  await dialog.getByRole("checkbox", { name: /Cliente Alfa do lote/ }).check();
  await expect(
    dialog.getByRole("checkbox", { name: /Cliente Recente do lote/ }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await (await api.get(`/patients/${selected.id}`)).json(),
  ).toMatchObject({ status: "active" });

  await more.click();
  await page.getByRole("menuitem", { name: "Inativar em lote" }).click();
  await preview.click();
  await dialog.getByRole("checkbox", { name: /Cliente Alfa do lote/ }).check();
  await dialog.getByRole("checkbox", { name: /Cliente Beta do lote/ }).check();
  await expect(dialog.getByRole("status")).toContainText(
    "2 clientes selecionados",
  );
  expect(
    (
      await api.patch(`/patients/${skipped.id}/status`, {
        data: { status: "inactive" },
      })
    ).ok(),
  ).toBe(true);
  await confirm.click();

  await expect(
    page.getByText("1 cliente inativado · 1 cliente ignorado"),
  ).toBeVisible();
  for (const [patient, status] of [
    [selected, "inactive"],
    [untouched, "active"],
    [recent, "active"],
  ]) {
    expect(
      await (await api.get(`/patients/${patient.id}`)).json(),
    ).toMatchObject({ status });
  }
  await page.unrouteAll({ behavior: "wait" });
});

test("exibe autoria dos acessos para um perfil com a permissão específica", async ({
  api,
  page,
}) => {
  const patient = await seedPatient(api, "Ficha com histórico de acessos");
  const other = await seedPatient(api, "Ficha de outro cliente");
  const user = {
    fullName: "Auditora de prontuários",
    email: "auditora@example.invalid",
    password: "Auditora@123",
    role: "user",
    permissions: ["patients.view", "clinical.view", "clinical.access_events"],
  };
  expect((await api.post("/admin/users", { data: user })).status()).toBe(201);
  expect((await api.get(`/clinical-workspace/${patient.id}/export`)).ok()).toBe(
    true,
  );
  expect((await api.get(`/clinical-workspace/${other.id}/export`)).ok()).toBe(
    true,
  );
  await login(page, user.email, user.password);
  await page.goto(`/clientes/${patient.id}`);
  await page.getByRole("tab", { name: "Prontuário", exact: true }).click();
  await page.getByRole("button", { name: "Mais ações", exact: true }).click();
  await page.getByRole("menuitem", { name: "Histórico de acessos" }).click();

  const dialog = page.getByRole("dialog", { name: "Histórico de acessos" });
  await expect(dialog.getByText(patient.fullName)).toBeVisible();
  const entries = dialog.getByRole("listitem");
  await expect(entries.first()).toContainText("Consulta");
  await expect(entries.first()).toContainText(user.fullName);
  await expect(entries.first().locator("time")).toHaveAttribute(
    "datetime",
    /T/,
  );
  await expect(dialog.getByText("Exportação", { exact: true })).toHaveCount(1);
  await expect(dialog.getByText("Aryana Dutra", { exact: true })).toHaveCount(
    1,
  );
  await page.unrouteAll({ behavior: "wait" });
});

test("reserva o histórico e a inativação em lote aos perfis autorizados", async ({
  api,
  apiServer,
  page,
  request,
}) => {
  const patient = await seedPatient(api, "Ficha com acesso restrito");
  const user = {
    fullName: "Consulta sem auditoria",
    email: "consulta@example.invalid",
    password: "Consulta@123",
    role: "user",
    permissions: [
      "patients.view",
      "patients.update",
      "patients.import",
      "clinical.view",
    ],
  };
  expect((await api.post("/admin/users", { data: user })).status()).toBe(201);
  await login(page, user.email, user.password);
  await page.goto("/clientes");
  await page.getByRole("button", { name: "Mais", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Importar" })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Inativar em lote" }),
  ).toHaveCount(0);
  await page.goto(`/clientes/${patient.id}`);
  await page.getByRole("tab", { name: "Prontuário", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Linha do tempo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mais ações", exact: true }),
  ).toHaveCount(0);

  const token = await page.evaluate(() =>
    localStorage.getItem("crm.auth.token"),
  );
  const headers = { Authorization: `Bearer ${token}` };
  const deniedEvents = await request.get(
    `${apiServer.url}/clinical-workspace/${patient.id}/access-events`,
    { headers },
  );
  const deniedPreview = await request.post(
    `${apiServer.url}/patients/inactivation/preview`,
    { headers, data: { months: 12 } },
  );
  const deniedInactivation = await request.post(
    `${apiServer.url}/patients/inactivation`,
    { headers, data: { months: 12, patientIds: [patient.id] } },
  );
  expect(deniedEvents.status()).toBe(403);
  expect(deniedPreview.status()).toBe(403);
  expect(deniedInactivation.status()).toBe(403);
  await page.unrouteAll({ behavior: "wait" });
});
