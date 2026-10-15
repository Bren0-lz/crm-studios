import { test, expect, login } from "./fixtures.js";

test("daily agenda metrics remain readable on desktop and mobile", async ({
  page,
}) => {
  await login(page);
  const metrics = page.getByRole("region", {
    name: "Resumo da agenda de hoje",
  });
  await expect(metrics.getByRole("article")).toHaveCount(4);
  for (const label of [
    "Atendimentos hoje",
    "Pendentes hoje",
    "A confirmar",
    "Já finalizados",
  ])
    await expect(metrics.getByText(label, { exact: true })).toBeVisible();
  await expect(
    metrics.getByText("Sem cancelados", { exact: true }),
  ).toBeVisible();
  await expect(
    metrics.getByText("Aguardando finalização", { exact: true }),
  ).toBeVisible();
  await expect(
    metrics.getByText("Ainda sem confirmação", { exact: true }),
  ).toBeVisible();
  await expect(metrics.getByText(/de \d+ atendimentos hoje/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const cards = await metrics.getByRole("article").all();
  const boxes = await Promise.all(cards.map((card) => card.boundingBox()));
  if (page.viewportSize()!.width <= 700) {
    for (let index = 1; index < boxes.length; index++)
      expect(boxes[index]!.y).toBeGreaterThanOrEqual(
        boxes[index - 1]!.y + boxes[index - 1]!.height,
      );
  } else {
    for (const box of boxes) expect(box!.y).toBe(boxes[0]!.y);
  }
});

test("all operational modules open without application errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  for (const route of [
    "/",
    "/clientes",
    "/agenda",
    "/turmas",
    "/planos",
    "/financeiro",
    "/comercial",
    "/relacionamento",
    "/comunicacoes",
    "/contratos",
    "/prontuarios",
    "/historico",
    "/relatorios",
    "/configuracoes",
  ]) {
    await page.goto(route);
    await expect(page.locator(".page-header")).toBeVisible();
    await expect(page.locator(".loading-block")).toHaveCount(0);
    await expect(page.locator(".error-banner")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
