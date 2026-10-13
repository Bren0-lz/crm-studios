import { test, expect, login } from "./fixtures.js";

test("login validates credentials and logout ends the session", async ({
  page,
}) => {
  await page.goto("/clientes");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Senha", { exact: true }).fill("invalid-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator(".form-error")).toContainText(/inválid|incorret/i);
  await login(page);
  const logout = page.getByTitle("Sair", { exact: true });
  const menu = page.getByRole("button", { name: "Abrir menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await logout.click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    await page.evaluate(() => localStorage.getItem("crm.auth.token")),
  ).toBeNull();
});

test("a user with view permission cannot write or open another module", async ({
  page,
  api,
  apiServer,
  request,
}) => {
  const response = await api.post("/admin/users", {
    data: {
      fullName: "Consulta Clientes",
      email: "viewer@example.com",
      password: "Viewer@123",
      role: "user",
      permissions: ["patients.view"],
    },
  });
  expect(response.status()).toBe(201);
  await login(page, "viewer@example.com", "Viewer@123");
  await page.goto("/clientes");
  await expect(
    page.getByRole("heading", { name: "Clientes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Novo cliente", exact: true }),
  ).toHaveCount(0);
  await page.goto("/financeiro");
  await expect(page).toHaveURL(/\/$/);
  const token = await page.evaluate(() =>
    localStorage.getItem("crm.auth.token"),
  );
  const denied = await request.get(`${apiServer.url}/finance/workspace`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(denied.status()).toBe(403);
});
