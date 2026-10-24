import {
  test,
  expect,
  login,
  seedPatient,
  selectPatient,
  chooseAppointmentTime,
  clinicToday,
} from "./fixtures.js";

test("appointment modals preserve the scrolled agenda and sticky shell", async ({
  page,
  api,
}, testInfo) => {
  const patient = await seedPatient(api, "Cliente Fundo da Agenda");
  const services = await (await api.get("/services")).json();
  const professionals = await (await api.get("/professionals")).json();
  const rooms = await (await api.get("/rooms")).json();
  const created = await api.post("/appointments", {
    data: {
      patientId: patient.id,
      serviceId: services[0].id,
      professionalId: professionals[0].id,
      roomId: rooms[0].id,
      startsAt: `${clinicToday()}T21:00:00-03:00`,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  await login(page);
  await page.goto("/agenda");
  await page.evaluate(() => document.fonts.ready);
  const appointment = page.getByRole("button", {
    name: `Detalhes de ${patient.fullName}`,
    exact: true,
  });
  await appointment.scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);

  const background = () =>
    page.evaluate(() => {
      const bounds = (selector: string) => {
        const { x, y, width, height } = document
          .querySelector(selector)!
          .getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        header: bounds(".topbar"),
        sidebar: bounds(".sidebar"),
        agenda: bounds(".agenda-panel"),
      };
    });
  const before = await background();
  expect(Math.abs(before.header.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(before.sidebar.y)).toBeLessThanOrEqual(1);
  expect(before.sidebar.height).toBe(page.viewportSize()!.height);
  const expectStable = async () => {
    const after = await background();
    expect(after.scrollX).toBe(before.scrollX);
    expect(after.scrollY).toBe(before.scrollY);
    for (const element of ["header", "sidebar", "agenda"] as const)
      for (const key of ["x", "y", "width", "height"] as const)
        expect(
          Math.abs(after[element][key] - before[element][key]),
          `${element}.${key} deve permanecer estável`,
        ).toBeLessThanOrEqual(1);
  };
  const wheelOnBackground = async () => {
    await page.mouse.move(1, page.viewportSize()!.height / 2);
    await page.mouse.wheel(0, 400);
    // Wait for wheel handling and layout before checking the locked background.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expectStable();
  };

  await appointment.click();
  const details = page.getByRole("dialog", { name: "Detalhes do atendimento" });
  await expect(details).toBeVisible();
  await expectStable();
  await wheelOnBackground();
  const body = details.locator(".modal-body");
  await body.hover();
  await page.mouse.wheel(0, 300);
  await expect
    .poll(() => body.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expectStable();
  await page.screenshot({
    path: testInfo.outputPath("agenda-details-scroll-lock.png"),
  });

  await details.getByRole("button", { name: "Editar", exact: true }).click();
  const edit = page.getByRole("dialog", {
    name: "Editar atendimento",
    exact: true,
  });
  await edit
    .getByLabel("Observação", { exact: true })
    .fill("Edição temporária");
  await page.keyboard.press("Escape");
  const discard = page.getByRole("dialog", { name: "Descartar alterações?" });
  await expect(discard).toBeVisible();
  await expect(page.locator('[role="dialog"]')).toHaveCount(2);
  await wheelOnBackground();
  await page.keyboard.press("Escape");
  await expect(discard).toHaveCount(0);
  await expect(edit).toBeVisible();
  await wheelOnBackground();
  await page.keyboard.press("Escape");
  await discard.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(details).toBeVisible();
  await expectStable();
  await details.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(details).toHaveCount(0);
  await expectStable();
  await expect(page.locator("html")).not.toHaveClass(/modal-open/);
  await page.mouse.move(page.viewportSize()!.width - 20, 100);
  await page.mouse.wheel(0, -200);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeLessThan(before.scrollY);
});

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
  const client = page.getByRole("dialog", {
    name: "Novo cliente",
    exact: true,
  });
  await expect(add).toHaveCount(0);
  if (page.viewportSize()!.width > 700) {
    const pickerBox = (await picker.boundingBox())!;
    const typeBox = (await appointment
      .getByRole("combobox", { name: "Tipo", exact: true })
      .boundingBox())!;
    expect(Math.abs(pickerBox.y - typeBox.y)).toBeLessThanOrEqual(1);
  }
  await picker.focus();
  await expect(add).toBeVisible();
  await expect(
    appointment.getByRole("listbox").getByRole("option"),
  ).toHaveCount(0);
  await expect(appointment.getByRole("status")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("client-focus-footer.png"),
  });
  await picker.press("Tab");
  await expect(add).toBeFocused();
  await add.press("Enter");
  await expect(client).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(client).toHaveCount(0);
  await expect(picker).toBeFocused();
  await expect(picker).toHaveValue("");
  await appointment
    .getByRole("textbox", { name: "Observação", exact: true })
    .fill("Manter observação");
  await expect(add).toHaveCount(0);
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
  await picker.press("Tab");
  await picker.focus();
  await expect(add).toBeVisible();
  await add.click();
  await expect(client).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(client).toHaveCount(0);
  await expect(picker).toHaveValue("Cliente Sugestão 11");

  await picker.fill("Cliente Inédito");
  await expect(
    appointment.getByText("Nenhum cliente encontrado"),
  ).toBeVisible();
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
  await client.getByLabel("CPF", { exact: true }).fill("52998224725");
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
  await expect(add).toBeVisible();
  await expect(
    appointment.getByRole("listbox").getByRole("option"),
  ).toHaveCount(0);
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
