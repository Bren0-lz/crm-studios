import { test, expect, login, seedPatient } from "./fixtures.js";

test("creates and edits a commercial event through its own module", async ({
  page,
  api,
}) => {
  await login(page);
  await page.goto("/eventos");
  await expect(page.getByText("Nenhum evento cadastrado")).toBeVisible();
  await page.getByRole("button", { name: "Novo evento", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Novo evento", exact: true });
  await dialog
    .getByLabel("Nome do evento", { exact: true })
    .fill("Aulão de movimento");
  await dialog.getByLabel(/Data e horário/).fill("2039-06-10T09:00");
  await dialog
    .getByLabel("Local ou cidade", { exact: true })
    .fill("Praça Central");
  await dialog.getByLabel("Público estimado", { exact: true }).fill("0");
  await dialog
    .getByRole("button", { name: "Salvar evento", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Aulão de movimento", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar Aulão de movimento", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "Editar evento", exact: true });
  await expect(edit.getByLabel(/Data e horário/)).toHaveValue(
    "2039-06-10T09:00",
  );
  await edit
    .getByLabel("Nome do evento", { exact: true })
    .fill("Aulão atualizado");
  await edit
    .getByRole("button", { name: "Salvar evento", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Aulão atualizado", exact: true }),
  ).toBeVisible();
  const response = await api.get("/events");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual([
    expect.objectContaining({
      name: "Aulão atualizado",
      attendeeCount: 0,
      startsAt: "2039-06-10T12:00:00.000Z",
    }),
  ]);
});

test("imports event participants with custom columns, missing data and existing contacts", async ({
  page,
  api,
}) => {
  await seedPatient(api, "Cliente já cadastrado");
  const response = await api.post("/events", {
    data: { name: "Encontro aberto", startsAt: "2039-06-10T12:00:00.000Z" },
  });
  expect(response.ok()).toBe(true);
  const event = await response.json();
  await login(page);
  await page.goto(`/eventos/${event.id}`);
  await page.getByRole("button", { name: "Importar participantes" }).click();
  const dialog = page.getByRole("dialog", { name: "Importar participantes" });
  await dialog.getByLabel("Planilha de participantes").setInputFiles({
    name: "presença.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Pessoa;Contato;Observações\nAna;11999991234;\nBia;11999991234;\n;;Apenas observação\n;123;",
    ),
  });
  await dialog
    .getByLabel("Dado do sistema para a coluna Pessoa")
    .selectOption("fullName");
  await expect(dialog.getByText("3 válida(s)", { exact: true })).toBeVisible();
  await dialog
    .getByLabel("Dado do sistema para a coluna Contato")
    .selectOption("phone");
  await expect(
    dialog.getByRole("button", { name: "Importar 4 participante(s)" }),
  ).toBeEnabled();
  await expect(
    dialog.getByText("Nenhum campo é obrigatório", { exact: false }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: test.info().outputPath("event-import.png"),
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Importar 4 participante(s)" })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "3 participante(s) novo(s), 0 já cliente(s) vinculado(s), 1 ignorado(s) por já estar(em) no evento e 0 com erro.",
  );
  await dialog
    .locator(".modal-actions")
    .getByRole("button", { name: "Fechar", exact: true })
    .click();
  await expect(
    page.getByText("3 participante(s)", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Ana", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("123", { exact: true })).toBeVisible();
  const participants = (await (await api.get(`/events/${event.id}`)).json())
    .participants;
  expect(
    participants.filter(
      (item: { phone: string }) => item.phone === "11999991234",
    ),
  ).toHaveLength(1);
  expect(participants).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fullName: "",
        phone: "",
        notes: "Apenas observação",
      }),
    ]),
  );
  await page
    .getByRole("button", { name: "Adicionar participante", exact: true })
    .click();
  const add = page.getByRole("dialog", { name: "Adicionar participante" });
  await add
    .getByRole("button", { name: "Adicionar participante", exact: true })
    .click();
  await expect(add).toHaveCount(0);
  await expect(
    page.getByText("5 participante(s)", { exact: true }),
  ).toBeVisible();
});
