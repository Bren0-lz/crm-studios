import { test, expect, login } from "./fixtures.js";

test("aligns plan service rows and preserves values when adding and removing a row", async ({
  page,
  api,
}) => {
  const response = await api.get("/services");
  expect(response.ok()).toBe(true);
  const services = (await response.json()) as { id: string }[];
  expect(services.length).toBeGreaterThanOrEqual(2);
  const created = await api.post("/plan-templates", {
    data: {
      name: "Plano de vários serviços",
      kind: "custom",
      planType: "promotional",
      active: true,
      totalValueInCents: 30000,
      services: [
        {
          serviceId: services[0]!.id,
          totalSessions: 4,
          totalValueInCents: 20000,
        },
        {
          serviceId: services[1]!.id,
          totalSessions: 2,
          totalValueInCents: 10000,
        },
      ],
    },
  });
  expect(created.status()).toBe(201);
  await login(page);
  await page.goto("/configuracoes");
  await page.getByRole("tab", { name: "Planos", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Editar Plano de vários serviços",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  const rows = dialog.locator(".plan-template-service-fields");
  await expect(rows).toHaveCount(2);
  const first = rows.first();
  const select = await first
    .getByRole("combobox", { name: "Serviço 1", exact: true })
    .boundingBox();
  const sessions = await first
    .getByRole("spinbutton", { name: "Sessões do serviço 1", exact: true })
    .boundingBox();
  const value = await first
    .getByRole("textbox", { name: "Valor do serviço 1", exact: true })
    .boundingBox();
  const remove = await first
    .getByRole("button", { name: "Remover serviço 1", exact: true })
    .boundingBox();
  expect(select && sessions && value && remove).toBeTruthy();
  // A lixeira fica ao lado do rótulo do serviço, acima do campo pesquisável.
  expect(remove!.y + remove!.height).toBeLessThanOrEqual(select!.y);
  expect(
    Math.abs(remove!.x + remove!.width - select!.x - select!.width),
  ).toBeLessThan(2);
  expect(select!.y + select!.height).toBeLessThan(sessions!.y);
  if ((page.viewportSize()?.width ?? 0) > 700) {
    expect(Math.abs(sessions!.y - value!.y)).toBeLessThan(2);
    expect(sessions!.x).toBeLessThan(value!.x);
  } else {
    expect(sessions!.y).toBeLessThan(value!.y);
  }
  const add = dialog.getByRole("button", {
    name: "Adicionar serviço",
    exact: true,
  });
  expect((await add.boundingBox())!.width).toBeLessThan(
    (await rows.first().boundingBox())!.width,
  );
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  const previous = await first
    .getByRole("textbox", { name: "Valor do serviço 1", exact: true })
    .inputValue();
  const total = await dialog
    .getByLabel("Valor total", { exact: true })
    .inputValue();
  await add.click();
  await expect(rows).toHaveCount(3);
  await dialog
    .getByRole("button", { name: "Remover serviço 3", exact: true })
    .click();
  await expect(rows).toHaveCount(2);
  await expect(
    first.getByRole("textbox", { name: "Valor do serviço 1", exact: true }),
  ).toHaveValue(previous);
  await expect(dialog.getByLabel("Valor total", { exact: true })).toHaveValue(
    total,
  );
});
