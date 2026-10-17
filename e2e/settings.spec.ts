import { test, expect, login } from "./fixtures.js";

test("settings can be saved repeatedly after switching tabs and reloading", async ({
  page,
  api,
}) => {
  await login(page);
  await page.goto("/configuracoes");
  const panel = page.getByRole("tabpanel");

  await panel.getByLabel("Nome", { exact: true }).fill("Clínica atualizada");
  await panel.getByLabel("Razão social").fill("Clínica Ltda.");
  await panel.getByLabel("CNPJ/CPF").fill("11.222.333/0001-81");
  await panel.getByLabel("Telefone", { exact: true }).fill("11999991234");
  await panel.getByLabel("E-mail", { exact: true }).fill("clinica@example.com");
  await panel.getByLabel("Endereço").fill("Rua de teste, 123");
  await panel.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(panel.getByText("Dados da clínica salvos.")).toBeVisible();
  expect(await (await api.get("/admin/clinic-settings")).json()).toMatchObject({
    name: "Clínica atualizada",
    legalName: "Clínica Ltda.",
    taxId: "11.222.333/0001-81",
    phone: "11999991234",
    email: "clinica@example.com",
    address: "Rua de teste, 123",
  });

  await page.getByRole("tab", { name: "Usuários", exact: true }).click();
  await panel.getByRole("button", { name: "Novo usuário" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome completo").fill("Usuária de teste");
  await dialog.getByLabel("E-mail de acesso").fill("usuario@example.com");
  await dialog.getByLabel("Senha inicial").fill("SenhaForte123");
  await dialog
    .getByRole("button", { name: "Criar usuário", exact: true })
    .click();
  await expect(
    panel.getByText("Usuário Usuária de teste criado."),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Planos", exact: true }).click();
  await panel
    .getByRole("button", { name: "Cadastrar plano", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do plano").fill("Plano de teste");
  await dialog.getByLabel("Valor total", { exact: true }).fill("200");
  const services = await (await api.get("/services")).json();
  await dialog
    .getByRole("combobox", { name: "Serviço 1", exact: true })
    .selectOption(services[0].id);
  await dialog.getByLabel("Sessões por semana do serviço 1").fill("2");
  await dialog
    .getByRole("button", { name: "Salvar plano", exact: true })
    .click();
  await expect(panel.getByText("Plano salvo.")).toBeVisible();

  await page.getByRole("tab", { name: "Feriados", exact: true }).click();
  await panel.getByLabel("Data", { exact: true }).fill("2026-12-25");
  await panel.getByLabel("Nome do feriado").fill("Feriado de teste");
  await panel.getByRole("button", { name: "Adicionar feriado" }).click();
  await expect(panel.getByText("Feriado adicionado.")).toBeVisible();

  await page.getByRole("tab", { name: "Etiquetas", exact: true }).click();
  await panel.getByLabel("Nome da etiqueta").fill("Etiqueta de teste");
  await panel.getByRole("button", { name: "Adicionar etiqueta" }).click();
  await expect(panel.getByText("Etiqueta criada.")).toBeVisible();

  await page.getByRole("tab", { name: "Relacionamento", exact: true }).click();
  await panel.getByLabel("Saldo baixo: sessões restantes").fill("7");
  await panel
    .getByRole("button", { name: "Salvar prazos e mensagens" })
    .click();
  await expect(panel.getByText("Prazos e mensagens salvos.")).toBeVisible();

  await page.getByRole("tab", { name: "Clínica", exact: true }).click();
  await panel.getByLabel("Razão social").fill("Clínica atualizada Ltda.");
  await panel.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(panel.getByText("Dados da clínica salvos.")).toBeVisible();
  await page.reload();
  await expect(panel.getByLabel("Razão social")).toHaveValue(
    "Clínica atualizada Ltda.",
  );
  await expect(panel.getByLabel("Telefone", { exact: true })).toHaveValue(
    "(11) 99999-1234",
  );

  await page.getByRole("tab", { name: "Usuários", exact: true }).click();
  await panel
    .getByRole("button", { name: "Editar Usuária de teste", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Cargo", { exact: true }).fill("Recepção");
  await dialog
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(
    panel.getByText("Alterações de Usuária de teste salvas."),
  ).toBeVisible();
  expect(await (await api.get("/admin/users")).json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        email: "usuario@example.com",
        jobTitle: "Recepção",
      }),
    ]),
  );

  await page.getByRole("tab", { name: "Planos", exact: true }).click();
  await panel
    .getByRole("button", { name: "Editar plano Plano de teste", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Valor total", { exact: true }).fill("250");
  await dialog
    .getByRole("button", { name: "Salvar plano", exact: true })
    .click();
  await expect(panel.getByText("Plano salvo.")).toBeVisible();
  expect(await (await api.get("/plan-templates")).json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: "Plano de teste",
        totalValueInCents: 25000,
      }),
    ]),
  );

  await page.getByRole("tab", { name: "Feriados", exact: true }).click();
  await expect(
    panel.getByText("Feriado de teste", { exact: true }),
  ).toBeVisible();
  await panel.getByLabel("Data", { exact: true }).fill("2026-12-31");
  await panel.getByLabel("Nome do feriado").fill("Outro feriado");
  await panel.getByRole("button", { name: "Adicionar feriado" }).click();
  await expect(panel.getByText("Outro feriado", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Etiquetas", exact: true }).click();
  await panel
    .getByRole("button", {
      name: "Editar etiqueta Etiqueta de teste",
      exact: true,
    })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome da etiqueta").fill("Etiqueta atualizada");
  await dialog
    .getByRole("button", { name: "Salvar etiqueta", exact: true })
    .click();
  await expect(
    panel.getByText("Etiqueta atualizada", { exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Relacionamento", exact: true }).click();
  await expect(panel.getByLabel("Saldo baixo: sessões restantes")).toHaveValue(
    "7",
  );
  await panel.getByLabel("Saldo baixo: sessões restantes").fill("8");
  await panel
    .getByRole("button", { name: "Salvar prazos e mensagens" })
    .click();
  await expect(panel.getByText("Prazos e mensagens salvos.")).toBeVisible();
  expect(await (await api.get("/relationship/settings")).json()).toMatchObject({
    lowBalanceSessions: 8,
  });
});
