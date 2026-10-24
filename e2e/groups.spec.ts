import type { GroupClass, GroupWorkspace, Room } from "@crm/contracts";
import { test, expect, login, seedPatient } from "./fixtures.js";

test("creates and renames a group without changing its meetings", async ({
  page,
  api,
}, testInfo) => {
  const services = await (await api.get("/services")).json();
  const professionals = await (await api.get("/professionals")).json();
  const rooms: Room[] = await (await api.get("/rooms")).json();
  const room = rooms.find((item) => item.active && item.capacity >= 2)!;
  await login(page);
  await page.goto("/turmas");
  await page.getByRole("button", { name: "Nova turma" }).click();
  const create = page.getByRole("dialog", { name: "Nova turma" });
  await create
    .getByRole("combobox", { name: "Serviço", exact: true })
    .selectOption(services[0].id);
  await create
    .getByRole("combobox", { name: "Profissional", exact: true })
    .selectOption(professionals[0].id);
  await create
    .getByRole("combobox", { name: "Sala", exact: true })
    .selectOption(room.id);
  const name = create.getByRole("textbox", { name: /^Nome da turma/ });
  await expect(name).toHaveAttribute("placeholder", /Turma A$/);
  await name.fill("Pilates da manhã");
  await create.getByRole("button", { name: "Adicionar horário" }).click();
  await create
    .getByRole("button", { name: "Criar turma", exact: true })
    .click();
  await expect(create).toHaveCount(0);
  const card = page
    .locator(".group-card")
    .filter({ hasText: "Pilates da manhã" });
  await expect(card).toBeVisible();
  const from = new Date().toISOString(),
    to = new Date(Date.now() + 30 * 86400000).toISOString();
  const read = async (): Promise<GroupWorkspace> =>
    (await api.get("/groups/workspace", { params: { from, to } })).json();
  const before = await read();
  const group = before.groups.find((item) => item.name === "Pilates da manhã")!;
  expect(
    before.sessions.filter((item) => item.groupId === group.id).length,
  ).toBeGreaterThan(0);
  await card.getByRole("button", { name: "Abrir turma" }).click();
  const edit = page.getByRole("dialog", {
    name: "Pilates da manhã",
    exact: true,
  });
  await edit
    .getByLabel("Nome da turma", { exact: true })
    .fill("Pilates especial");
  await edit.getByRole("button", { name: "Salvar nome" }).click();
  await expect(edit).toHaveCount(0);
  const renamed = page
    .locator(".group-card")
    .filter({ hasText: "Pilates especial" });
  await expect(renamed).toBeVisible();
  await page.reload();
  await renamed.getByRole("button", { name: "Abrir turma" }).click();
  const persisted = page.getByRole("dialog", {
    name: "Pilates especial",
    exact: true,
  });
  await expect(
    persisted.getByLabel("Nome da turma", { exact: true }),
  ).toHaveValue("Pilates especial");
  expect(
    await persisted.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("group-name.png") });
  const after = await read();
  expect(after.groups.find((item) => item.id === group.id)).toEqual({
    ...group,
    name: "Pilates especial",
  });
  expect(after.sessions.filter((item) => item.groupId === group.id)).toEqual(
    before.sessions
      .filter((item) => item.groupId === group.id)
      .map((item) => ({ ...item, groupName: "Pilates especial" })),
  );
  const longName = "Turma ".padEnd(120, "A");
  await persisted.getByLabel("Nome da turma", { exact: true }).fill(longName);
  await persisted.getByRole("button", { name: "Salvar nome" }).click();
  const longCard = page.locator(".group-card").filter({ hasText: longName });
  await expect(longCard).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test("keeps attendance and replacements inside each group's horizontal tabs", async ({
  page,
  api,
}, testInfo) => {
  const patient = await seedPatient(api, "Cliente Frequência por Turma");
  const services = await (await api.get("/services")).json();
  const professionals = await (await api.get("/professionals")).json();
  const rooms: Room[] = await (await api.get("/rooms")).json();
  const room = rooms.find((item) => item.active && item.capacity >= 2)!;
  expect(room).toBeDefined();
  const groups: GroupClass[] = [];
  for (const weekday of [2, 4]) {
    const response = await api.post("/groups", {
      data: {
        serviceId: services[0].id,
        professionalId: professionals[0].id,
        roomId: room.id,
        capacity: 2,
        weeklySlots: [{ weekday, startTime: "18:00", endTime: "19:00" }],
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    groups.push(await response.json());
  }
  const [groupA, groupB] = groups as [GroupClass, GroupClass];
  const enrolled = await api.post("/group-enrollments", {
    data: { groupId: groupA.id, patientId: patient.id },
  });
  expect(enrolled.status()).toBe(201);
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 90 * 86_400_000).toISOString();
  const workspace: GroupWorkspace = await (
    await api.get("/groups/workspace", { params: { from, to } })
  ).json();
  const source = workspace.sessions.find((item) => item.groupId === groupA.id)!;
  const target = workspace.sessions.find((item) => item.groupId === groupB.id)!;
  expect(source).toBeDefined();
  expect(target).toBeDefined();
  const absence = await api.put(
    `/group-sessions/${source.id}/attendance/${patient.id}`,
    {
      data: { status: "excused_absence" },
    },
  );
  expect(absence.ok(), await absence.text()).toBe(true);

  await login(page);
  await page.goto("/turmas");
  await expect(
    page.getByRole("heading", { name: "Frequência e reposições" }),
  ).toHaveCount(0);
  const card = page.locator(".group-card").filter({ hasText: groupA.name });
  await card.getByRole("button", { name: "Abrir turma" }).click();
  const dialog = page.getByRole("dialog", { name: groupA.name, exact: true });
  const details = dialog.getByRole("tab", { name: "Dados da turma" });
  const operations = dialog.getByRole("tab", {
    name: "Frequência e reposições",
  });
  await expect(details).toBeFocused();
  await details.press("ArrowRight");
  await expect(operations).toBeFocused();
  await expect(operations).toHaveAttribute("aria-selected", "true");
  // Calendário mensal só com as aulas da turma aberta; a lista do dia fica abaixo.
  const calendar = dialog.getByRole("table", { name: /^Aulas de / });
  await expect(calendar).toBeVisible();
  await expect(
    calendar.getByRole("button", { name: new RegExp(groupB.name) }),
  ).toHaveCount(0);
  const sourceDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date(source.startsAt));
  const monthsAhead =
    (Number(sourceDate.slice(0, 4)) - new Date().getFullYear()) * 12 +
    Number(sourceDate.slice(5, 7)) -
    (new Date().getMonth() + 1);
  for (let index = 0; index < monthsAhead; index += 1)
    await dialog.getByRole("button", { name: "Próximo mês" }).click();
  await calendar.locator(`[data-date="${sourceDate}"]`).click();
  await expect(
    dialog
      .locator(".group-calendar-day-list")
      .getByRole("button", { name: new RegExp(groupA.name) }),
  ).toHaveCount(1);
  await dialog.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Participantes" }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.scrollWidth - element.clientWidth),
    )
    .toBeLessThanOrEqual(1);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
  await page.screenshot({
    path: testInfo.outputPath("group-attendance-tab.png"),
  });

  await dialog
    .getByLabel("Crédito de reposição")
    .selectOption({ label: patient.fullName });
  const destination = dialog.getByLabel("Encontro de reposição");
  await expect(
    destination.locator(`option[value="${target.id}"]`),
  ).toContainText(groupB.name);
  await destination.selectOption(target.id);
  await dialog.getByRole("button", { name: "Reservar reposição" }).click();
  await expect(
    dialog.getByText("Nenhum crédito de reposição disponível"),
  ).toBeVisible();
  await expect(operations).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // O link existente da agenda abre a turma e o encontro de destino.
  await page.goto(`/turmas?sessionId=${target.id}`);
  const meeting = page.getByRole("dialog", { name: groupB.name, exact: true });
  await expect(
    meeting.getByText(`${patient.fullName} · Reposição`, { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[role="dialog"]')).toHaveCount(2);
  await expect(
    meeting.getByRole("button", { name: "Fechar", exact: true }).first(),
  ).toBeFocused();
  await meeting
    .getByRole("button", { name: "Fechar", exact: true })
    .last()
    .focus();
  await page.keyboard.press("Tab");
  await expect(
    meeting.getByRole("button", { name: "Fechar", exact: true }).first(),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator('[role="dialog"]')).toHaveCount(1);
  await expect(
    meeting.getByRole("tab", { name: "Frequência e reposições" }),
  ).toBeFocused();
  await expect(
    meeting.getByText("Nenhum crédito de reposição disponível"),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("group-destination-tab.png"),
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Em uma tela bem estreita, o menu rola sem alargar o modal.
  await page.setViewportSize({ width: 320, height: 640 });
  await page
    .locator(".group-card")
    .filter({ hasText: groupA.name })
    .getByRole("button", { name: "Abrir turma" })
    .click();
  await dialog.getByRole("tab", { name: "Frequência e reposições" }).click();
  await expect(dialog.getByRole("table", { name: /^Aulas de / })).toBeVisible();
  // Em 320 px os dias ficam compactos: as aulas aparecem na lista do dia.
  await expect(dialog.locator(".group-calendar-events").first()).toBeHidden();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  const panel = dialog.locator(".group-operations-panel");
  const panelBox = (await panel.boundingBox())!;
  const modalBox = (await dialog.boundingBox())!;
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(
    modalBox.x + modalBox.width,
  );
  const panelHead = panel.locator(".panel-head");
  expect(
    await panelHead.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  const menu = dialog.getByRole("tablist");
  expect(
    await menu.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("group-tabs-320.png") });
});
