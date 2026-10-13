import { test, expect, login } from "./fixtures.js";

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
