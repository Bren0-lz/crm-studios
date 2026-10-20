import {
  test,
  expect,
  login,
  seedPatient,
  selectPatient,
  chooseAppointmentTime,
  clinicToday,
} from "./fixtures.js";

test("creates a client from the suggestion footer with pointer and keyboard", async ({
  page,
  api,
}, testInfo) => {
  for (let index = 0; index < 12; index++) {
    await seedPatient(
      api,
      `Cliente Sugestão ${String(index).padStart(2, "0")}`,
    );
  }
  await login(page);
  await page.goto("/agenda");
  await page
    .getByRole("button", { name: "Novo atendimento", exact: true })
    .click();
  const appointment = page.getByRole("dialog", {
    name: "Novo atendimento",
    exact: true,
  });
  const picker = appointment.getByRole("combobox", {
    name: "Cliente",
    exact: true,
  });
  const add = appointment.getByRole("button", {
    name: "Adicionar cliente",
    exact: true,
  });
  await expect(add).toHaveCount(0);
  await appointment
    .getByRole("textbox", { name: "Observação", exact: true })
    .fill("Manter observação");
  await picker.fill("Cliente Sugestão");
  await expect(
    appointment.getByRole("listbox").getByRole("option"),
  ).toHaveCount(12);
  const results = appointment.locator(".patient-picker-results");
  expect(
    await results
      .locator("ul")
      .evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true);
  await expect(add).toBeInViewport();
  const panelBox = (await results.boundingBox())!;
  const footerBox = (await add.boundingBox())!;
  expect(footerBox.y).toBeGreaterThanOrEqual(panelBox.y);
  expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(
    panelBox.y + panelBox.height,
  );
  await page.screenshot({
    path: testInfo.outputPath("client-suggestion-footer.png"),
  });
  await picker.press("Tab");
  await expect(add).toBeFocused();
  await add.press("Shift+Tab");
  await expect(picker).toBeFocused();
  await picker.press("Tab");
  await add.press("Escape");
  await expect(picker).toBeFocused();
  await expect(results).toHaveCount(0);
  await expect(appointment).toBeVisible();

  await picker.press("ArrowUp");
  const last = appointment.getByRole("option", {
    name: "Cliente Sugestão 11",
    exact: true,
  });
  await expect(last).toBeInViewport();
  const lastBox = (await last.boundingBox())!;
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(
    (await add.locator("..").boundingBox())!.y,
  );
  await picker.press("Enter");
  await expect(picker).toHaveValue("Cliente Sugestão 11");
  await expect(results).toHaveCount(0);

  await picker.fill("Cliente Inédito");
  await expect(
    appointment.getByText("Nenhum cliente encontrado"),
  ).toBeVisible();
  const client = page.getByRole("dialog", {
    name: "Novo cliente",
    exact: true,
  });
  for (const activation of ["click", "Enter", "Space"]) {
    if (activation === "click") {
      await add.click();
    } else {
      await picker.press("Tab");
      await expect(add).toBeFocused();
      await add.press(activation);
    }
    await expect(client).toBeVisible();
    await expect(page.locator(".modal-backdrop[inert]")).toContainText(
      "Novo atendimento",
    );
    if (activation !== "Space") {
      await page.keyboard.press("Escape");
      await expect(client).toHaveCount(0);
      await expect(picker).toBeFocused();
      await expect(picker).toHaveValue("Cliente Inédito");
    }
  }
  await client
    .getByLabel("Nome completo", { exact: true })
    .fill("Cliente Inédito");
  await client
    .getByRole("group", { name: "Contato", exact: true })
    .getByLabel("Telefone", { exact: true })
    .fill("11999998888");
  await client
    .getByRole("button", { name: "Salvar cliente", exact: true })
    .click();
  await expect(client).toHaveCount(0);
  await expect(picker).toBeFocused();
  await expect(picker).toHaveValue("Cliente Inédito");
  await expect(results).toHaveCount(0);
  await expect(
    appointment.getByRole("textbox", { name: "Observação", exact: true }),
  ).toHaveValue("Manter observação");
  await expect(
    appointment.getByRole("button", {
      name: "Confirmar atendimento",
      exact: true,
    }),
  ).toBeEnabled();
});

test("schedules and reschedules an appointment without creating another occurrence", async ({
  page,
  api,
}) => {
  const patient = await seedPatient(api, "Cliente Agenda Navegador");
  const services = await (await api.get("/services")).json();
  const professionals = await (await api.get("/professionals")).json();
  const rooms = await (await api.get("/rooms")).json();
  await login(page);
  await page.goto("/agenda");
  await page
    .getByRole("button", { name: "Novo atendimento", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Novo atendimento",
    exact: true,
  });
  await selectPatient(dialog, patient.fullName);
  await dialog
    .getByRole("combobox", { name: "Tipo", exact: true })
    .selectOption("regular");
  await dialog
    .getByRole("combobox", { name: "Serviço", exact: true })
    .selectOption(services[0].id);
  await dialog
    .getByRole("combobox", { name: "Profissional", exact: true })
    .selectOption(professionals[0].id);
  await dialog
    .getByRole("combobox", { name: "Sala", exact: true })
    .selectOption(rooms[0].id);
  await chooseAppointmentTime(dialog, clinicToday(), "21:00");
  await dialog
    .getByRole("button", { name: "Confirmar atendimento", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("button", {
      name: `Detalhes de ${patient.fullName}`,
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remarcar atendimento", exact: true })
    .click();
  const reschedule = page.getByRole("dialog", {
    name: "Reagendar atendimento",
    exact: true,
  });
  await chooseAppointmentTime(reschedule, clinicToday(), "22:00");
  await reschedule
    .getByRole("button", {
      name: /Confirmar reagendamento|Salvar reagendamento/,
    })
    .click();
  await expect(reschedule).toHaveCount(0);
  const day = clinicToday();
  const from = new Date(`${day}T00:00:00-03:00`).toISOString();
  const to = new Date(Date.parse(from) + 24 * 60 * 60 * 1000).toISOString();
  const appointmentsResponse = await api.get(
    `/appointments?${new URLSearchParams({ from, to })}`,
  );
  expect(appointmentsResponse.ok()).toBe(true);
  const appointments = await appointmentsResponse.json();
  const matches = appointments.filter(
    (item: { patientId: string }) => item.patientId === patient.id,
  );
  expect(matches).toHaveLength(1);
  expect(
    new Date(matches[0].startsAt).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }),
  ).toBe("22:00");
  const history = await (
    await api.get(`/appointments/${matches[0].id}/reschedules`)
  ).json();
  expect(history).toHaveLength(1);
});
