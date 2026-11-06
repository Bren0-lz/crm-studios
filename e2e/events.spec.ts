import { test, expect, login } from "./fixtures.js";

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
