import {
  test as base,
  expect,
  request,
  type APIRequestContext,
  type Page,
  type Locator,
} from "@playwright/test";
import { buildApp } from "../apps/api/src/app.js";
import { MemoryClinicRepository } from "../apps/api/src/memory-repository.js";

type ApiServer = { url: string };

export const test = base.extend<{
  apiServer: ApiServer;
  api: APIRequestContext;
}>({
  apiServer: async ({ browserName: _browserName }, use) => {
    const app = await buildApp({
      repository: new MemoryClinicRepository(false),
      logger: false,
    });
    try {
      const url = await app.listen({ port: 0, host: "127.0.0.1" });
      await use({ url });
    } finally {
      await app.close();
    }
  },
  api: async ({ apiServer }, use) => {
    const client = await request.newContext({ baseURL: apiServer.url });
    const response = await client.post("/auth/login", {
      data: { email: "admin@movimenta.local", password: "Admin@123" },
    });
    expect(response.ok()).toBe(true);
    const { token } = await response.json();
    const authenticated = await request.newContext({
      baseURL: apiServer.url,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    try {
      await use(authenticated);
    } finally {
      await authenticated.dispose();
      await client.dispose();
    }
  },
  page: async ({ page, apiServer }, use) => {
    // Forward requests to this test's real Fastify server, without replacing API responses.
    await page.route("**/api/**", async (route) => {
      const incoming = new URL(route.request().url());
      const response = await route.fetch({
        url: `${apiServer.url}${incoming.pathname.slice(4)}${incoming.search}`,
      });
      await route.fulfill({ response });
    });
    await use(page);
  },
});

export { expect };

export async function login(
  page: Page,
  email = "admin@movimenta.local",
  password = "Admin@123",
) {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".session-check")).toHaveCount(0);
}

export async function seedPatient(api: APIRequestContext, name: string) {
  const response = await api.post("/patients", {
    data: { fullName: name, phone: "11999991234", tags: [] },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

export async function selectPatient(dialog: Locator, name: string) {
  const picker = dialog.getByRole("combobox", { name: "Cliente", exact: true });
  await picker.fill(name);
  await dialog.getByRole("option", { name, exact: true }).click();
}

export async function chooseAppointmentTime(
  dialog: Locator,
  date: string,
  time: string,
) {
  await dialog.getByRole("button", { name: "Data", exact: true }).click();
  await dialog.locator(`[data-date="${date}"]`).click();
  // Escolher o dia já fecha o calendário (QM4); Esc aqui fecharia o próprio modal
  // e, com o formulário preenchido, abriria "Descartar alterações?" (QM11).
  await dialog.getByLabel("Horário", { exact: true }).fill(time);
  await expect(
    dialog.getByRole("region", {
      name: "Calendário de agendamento",
      exact: true,
    }),
  ).toHaveCount(0);
}

export function clinicToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
