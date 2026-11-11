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
import { nextTestCpf } from "../apps/api/src/test-support/cpf.js";

/** API real do teste; o repositório dá acesso a dados que só existem no link (ex.: token do recibo). */
type ApiServer = { url: string; repository: MemoryClinicRepository };

export const test = base.extend<{
  apiServer: ApiServer;
  api: APIRequestContext;
}>({
  apiServer: async ({ browserName: _browserName }, use) => {
    const repository = new MemoryClinicRepository(false);
    const app = await buildApp({ repository, logger: false });
    try {
      const url = await app.listen({ port: 0, host: "127.0.0.1" });
      await use({ url, repository });
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
    data: {
      fullName: name,
      cpf: nextTestCpf(),
      phone: "11999991234",
      whatsapp: "11999991234",
      emergencyContactName: name,
      emergencyContactPhone: "11999991234",
      emergencyContactWhatsapp: "11999991234",
      tags: [],
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

/** Plano real para os cenários que precisam agendar atendimento normal (AP3). */
export async function seedPatientPlan(
  api: APIRequestContext,
  patientId: string,
  serviceId: string,
) {
  const services = [{ serviceId, totalSessions: 32, totalValueInCents: 0 }];
  const template = await api.post("/plan-templates", {
    data: {
      name: `Plano do cenário ${patientId.slice(0, 8)}`,
      services,
      totalValueInCents: 0,
    },
  });
  expect(template.status(), await template.text()).toBe(201);
  const plan = await api.post("/plans", {
    data: {
      patientId,
      planTemplateId: (await template.json()).id,
      name: "Plano do cenário",
      kind: "fixed_package",
      services,
      totalValueInCents: 0,
      installments: 1,
      validFrom: "2000-01-01",
      validUntil: "2199-12-31",
      firstDueDate: clinicToday(),
      autoRenew: false,
    },
  });
  expect(plan.status(), await plan.text()).toBe(201);
  return plan.json() as Promise<{ id: string }>;
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
  // O calendário permanece aberto para conferir a agenda do dia escolhido.
  await dialog.getByLabel("Horário", { exact: true }).fill(time);
  await dialog
    .getByRole("button", { name: "Fechar calendário", exact: true })
    .click();
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
