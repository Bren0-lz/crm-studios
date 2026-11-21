import { test, expect, login } from "./fixtures.js";

test("creates, searches and edits a client through the interface", async ({
  page,
  api,
}) => {
  await login(page);
  await page.goto("/clientes");
  await page.getByRole("button", { name: "Novo cliente", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Novo cliente",
    exact: true,
  });
  await dialog
    .getByLabel("Nome completo", { exact: true })
    .fill("Cliente Navegador");
  await dialog
    .getByRole("group", { name: "Contato", exact: true })
    .getByLabel("Telefone", { exact: true })
    .fill("11988887777");
  await dialog
    .getByRole("group", { name: "Contato", exact: true })
    .getByLabel("WhatsApp", { exact: true })
    .fill("11988887777");
  await dialog
    .getByRole("button", { name: "Usar os dados do cliente", exact: true })
    .click();
  await expect(
    dialog.getByText("Nada adicionado: só o cadastro do cliente será salvo."),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Salvar cliente", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("CPF", { exact: true }).fill("52998224725");
  await dialog
    .getByRole("button", { name: "Salvar cliente", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Cliente cadastrado", exact: true }),
  ).toHaveCount(0);
  await page
    .getByPlaceholder("Buscar por nome, CPF ou telefone")
    .fill("Cliente Navegador");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Editar Cliente Navegador", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar Cliente Navegador", exact: true })
    .click();
  const edit = page.getByRole("dialog", {
    name: "Editar cliente",
    exact: true,
  });
  await edit.getByLabel("E-mail", { exact: true }).fill("client@example.com");
  await edit
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(edit).toHaveCount(0);
  const result = await api.get("/patients?search=Cliente%20Navegador");
  expect(await result.json()).toEqual([
    expect.objectContaining({
      fullName: "Cliente Navegador",
      email: "client@example.com",
    }),
  ]);
});
