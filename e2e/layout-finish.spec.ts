import {
  defaultContractTemplateBody,
  documentContentFromText,
} from "@crm/contracts";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { nextTestCpf } from "../apps/api/src/test-support/cpf.js";
import { test, expect, login, clinicToday } from "./fixtures.js";

// RE11: itens de layout do teste E2E de 14/11/2026 (computador 1192px; celular 440 e 360px).
const desktop = { width: 1192, height: 860 };
const phones = [
  { width: 440, height: 860 },
  { width: 360, height: 780 },
];

/** Dois alertas no topo, como no teste: parcelas vencidas e atendimentos a finalizar. */
async function twoBannerAlerts(page: Page, apiUrl: string) {
  await bannerAlerts(page, apiUrl, {
    overdueReceivables: 4,
    pendingFinalization: 7,
  });
}

/** Alertas no topo com as contagens dadas (somadas às da API). */
async function bannerAlerts(
  page: Page,
  apiUrl: string,
  counts: Record<string, unknown>,
) {
  await page.route("**/api/notifications", async (route) => {
    const response = await route.fetch({ url: `${apiUrl}/notifications` });
    await route.fulfill({
      response,
      json: { ...(await response.json()), ...counts },
    });
  });
}

/** Os três alertas do cabeçalho, com uma vaga de turma de rótulo longo para o quarto. */
const manyAlerts = {
  overdueReceivables: 11,
  unsignedReceipts: 4,
  pendingFinalization: 0,
  overdueLeadTasks: 1,
  groupVacancies: [
    {
      groupId: "rf3-group",
      groupName: "TESTE Turma",
      vacancies: 1,
      waiting: 2,
      enrollmentId: "rf3-enrollment",
      patientId: "rf3-patient",
      patientName: "Cliente da Fila",
    },
  ],
};

async function box(locator: Locator) {
  const result = await locator.boundingBox();
  expect(result).not.toBeNull();
  return result!;
}

/** O elemento mostra o texto inteiro (sem reticências nem corte). */
async function notTruncated(locator: Locator) {
  const size = await locator.evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
}

/** O resumo e todos os atalhos ficam na mesma linha, inclusive fora da área visível. */
async function bannerItemsInOneRow(banner: Locator, count: number) {
  const scroller = banner.locator(".notification-banner-scroll");
  const items = scroller.locator(".notification-banner-item");
  await expect(items).toHaveCount(count);
  const first = await box(items.first());
  const summary = scroller.locator("strong");
  const summaryBox = await box(summary);
  expect(summaryBox.y + summaryBox.height / 2).toBeCloseTo(
    first.y + first.height / 2,
    0,
  );
  expect(
    await summary.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    }),
  ).toBe(1);
  for (const item of await items.all()) {
    const itemBox = await box(item);
    expect(itemBox.y).toBeCloseTo(first.y, 0);
    expect(itemBox.height).toBeCloseTo(first.height, 0);
    await notTruncated(item);
  }
  return scroller;
}

async function expectAutomaticBannerScroll(scroller: Locator) {
  expect(
    await scroller.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
}

async function seedTaggedPatient(api: APIRequestContext, fullName: string) {
  const tags = ["Pilates manhã avançado", "Dançaterapia terça", "VIP"];
  for (const name of tags) {
    const tag = await api.post("/patient-tags", { data: { name } });
    expect(tag.status(), await tag.text()).toBe(201);
  }
  const response = await api.post("/patients", {
    data: {
      fullName,
      cpf: nextTestCpf(),
      phone: "11999991234",
      whatsapp: "11999991234",
      emergencyContactName: fullName,
      emergencyContactPhone: "11999991234",
      emergencyContactWhatsapp: "11999991234",
      tags,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json() as Promise<{ id: string; fullName: string }>;
}

test("desktop 1192px: tags, lead message label, alerts and receivables fit", async ({
  page,
  api,
  apiServer,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Largura do computador.");
  await page.setViewportSize(desktop);
  const patient = await seedTaggedPatient(
    api,
    "Maria Aparecida dos Santos Oliveira",
  );
  const services = await (await api.get("/services")).json();
  const sold = [
    { serviceId: services[0].id, totalSessions: 8, totalValueInCents: 120000 },
  ];
  const template = await api.post("/plan-templates", {
    data: {
      name: "Pacote Pilates Mensal",
      kind: "fixed_package",
      totalValueInCents: 120000,
      services: sold,
    },
  });
  expect(template.status(), await template.text()).toBe(201);
  const plan = await api.post("/plans", {
    data: {
      patientId: patient.id,
      planTemplateId: (await template.json()).id,
      name: "Pacote Pilates Mensal",
      kind: "fixed_package",
      services: sold,
      totalValueInCents: 120000,
      installments: 3,
      validFrom: "2000-01-01",
      validUntil: "2199-12-31",
      firstDueDate: clinicToday(),
      autoRenew: false,
    },
  });
  expect(plan.status(), await plan.text()).toBe(201);
  const lead = await api.post("/leads", {
    data: {
      fullName: "Joana Lead Mensagem",
      phone: "11988887777",
      source: "Instagram",
      interest: "Pilates",
    },
  });
  expect(lead.status(), await lead.text()).toBe(201);
  const leadId = (await lead.json()).id;
  for (let index = 0; index < 3; index++) {
    const contact = await api.post(`/leads/${leadId}/contacts`, {
      data: { channel: "whatsapp", direction: "outbound", notes: "Mensagem" },
    });
    expect(contact.status(), await contact.text()).toBe(201);
  }
  await twoBannerAlerts(page, apiServer.url);
  await login(page);

  await bannerItemsInOneRow(
    page.getByRole("region", { name: "Alertas", exact: true }),
    2,
  );

  // Clientes: as etiquetas ficam na coluna delas, sem cobrir o contato nem a situação.
  await page.goto("/clientes");
  await page
    .getByPlaceholder("Buscar por nome, CPF ou telefone")
    .fill(patient.fullName);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const row = page.getByRole("button", {
    name: `Abrir ficha de ${patient.fullName}`,
    exact: true,
  });
  await expect(row).toBeVisible();
  const contact = await box(row.getByText("E-mail não informado"));
  const tags = await box(row.locator(".tags-cell"));
  const status = await box(row.getByText("Ativo", { exact: true }));
  expect(tags.x).toBeGreaterThanOrEqual(contact.x + contact.width);
  expect(tags.x + tags.width).toBeLessThanOrEqual(status.x);
  for (const tag of await row.locator(".tags-cell > *").all()) {
    const tagBox = await box(tag);
    expect(tagBox.x).toBeGreaterThanOrEqual(tags.x - 1);
    expect(tagBox.x + tagBox.width).toBeLessThanOrEqual(
      tags.x + tags.width + 1,
    );
  }

  // Cartão do lead: "Enviada" e a data inteiros.
  await page.goto("/comercial");
  const card = page.locator(".lead-card").filter({
    hasText: "Joana Lead Mensagem",
  });
  const sent = card.locator(".lead-message-status");
  await expect(sent).toContainText("Enviada");
  await notTruncated(sent.locator("span").first());
  await notTruncated(sent.locator("time"));
  const label = await box(sent.locator("span").first());
  expect(label.width).toBeGreaterThan(30);
  await notTruncated(sent);

  // Contas a receber: sem rolagem lateral e "Dar baixa" inteiro à vista.
  await page.goto("/financeiro");
  const receivable = page
    .locator(".finance-row")
    .filter({ hasText: patient.fullName })
    .first();
  const settle = receivable.getByRole("button", {
    name: "Dar baixa",
    exact: true,
  });
  await expect(settle).toBeVisible();
  const table = page.locator(".receivables-table");
  for (const scroller of [
    table,
    page.locator(".finance-panel").filter({ has: table }),
  ]) {
    if ((await scroller.count()) === 0) continue;
    await notTruncated(scroller);
  }
  const panel = await box(page.locator(".panel").filter({ has: table }));
  const settleBox = await box(settle);
  expect(settleBox.x + settleBox.width).toBeLessThanOrEqual(
    panel.x + panel.width,
  );
  await notTruncated(settle);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

/** Cada ação do topo (filial, SOS, sino) inteira à vista, sem cobrir a faixa de alertas. */
async function topActionsVisible(page: Page) {
  const banner = await box(
    page.getByRole("region", { name: "Alertas", exact: true }),
  );
  const actions = page.locator(".top-actions > *");
  expect(await actions.count()).toBeGreaterThanOrEqual(2);
  await expect(
    page.locator(".top-actions").getByRole("button", { name: /SOS/ }),
  ).toBeInViewport({ ratio: 1 });
  for (const action of await actions.all()) {
    await expect(action).toBeInViewport({ ratio: 1 });
    const actionBox = await box(action);
    const apart =
      actionBox.x >= banner.x + banner.width - 1 ||
      actionBox.x + actionBox.width <= banner.x + 1 ||
      actionBox.y >= banner.y + banner.height - 1 ||
      actionBox.y + actionBox.height <= banner.y + 1;
    expect(apart).toBe(true);
  }
}

for (const width of [821, 1000, 1192, 1502, 1621, 2200]) {
  test(`desktop ${width}px: 3 and 4 alerts stay on a single line`, async ({
    page,
    apiServer,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Largura do computador.");
    await page.setViewportSize({ width, height: desktop.height });
    const { groupVacancies, ...three } = manyAlerts;
    const counts: Record<string, unknown> = { ...three };
    // Lido a cada consulta: o quarto alerta entra mais abaixo, antes de recarregar.
    await bannerAlerts(page, apiServer.url, counts);
    await login(page);
    await page.mouse.move(0, 0);
    const banner = page.getByRole("region", { name: "Alertas", exact: true });
    await expect(banner).toContainText("16 pendências pedem atenção");
    const scroller = await bannerItemsInOneRow(banner, 3);
    if (width === 2200) await notTruncated(scroller);
    else await expectAutomaticBannerScroll(scroller);
    await topActionsVisible(page);

    counts.groupVacancies = groupVacancies;
    await page.reload();
    await expect(banner).toContainText(
      "TESTE Turma: 1 vaga disponível · 2 na espera",
    );
    await bannerItemsInOneRow(banner, 4);
    if (width === 2200) await notTruncated(scroller);
    else await expectAutomaticBannerScroll(scroller);
    await topActionsVisible(page);
    const topbar = await box(page.locator(".topbar"));
    const area = await box(banner);
    expect(area.y).toBeGreaterThanOrEqual(topbar.y);
    expect(area.y + area.height).toBeLessThanOrEqual(
      topbar.y + topbar.height + 1,
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}

test("desktop 1192px: with 4 alerts the template editor stays below the top bar", async ({
  page,
  apiServer,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Largura do computador.");
  await page.setViewportSize(desktop);
  await bannerAlerts(page, apiServer.url, manyAlerts);
  await login(page);
  await page.goto("/documentos");
  await page.getByRole("tab", { name: "Criar modelo", exact: true }).click();
  const studio = page.locator(".template-studio");
  const preview = studio.locator(".template-preview");
  await expect(preview).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Alertas", exact: true }),
  ).toContainText("TESTE Turma");
  expect((await box(page.locator(".topbar"))).height).toBeLessThan(80);
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const columns = [preview, studio.locator("> .template-body-input")];
  await expect
    .poll(async () => {
      const topbar = await box(page.locator(".topbar"));
      const bottom = topbar.y + topbar.height;
      for (const column of columns) {
        if (!(await column.isVisible())) continue;
        const columnBox = await box(column);
        if (columnBox.y < bottom - 1) return false;
        if (columnBox.y + columnBox.height > desktop.height + 1) return false;
      }
      return true;
    })
    .toBe(true);
});

for (const viewport of phones) {
  test(`phone ${viewport.width}px: alerts scroll away above the menu row`, async ({
    page,
    apiServer,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Celular.");
    await page.setViewportSize(viewport);
    await twoBannerAlerts(page, apiServer.url);
    await login(page);
    await page.goto("/agenda");
    const banner = page.getByRole("region", { name: "Alertas", exact: true });
    await expect(banner).toBeVisible();
    await expectAutomaticBannerScroll(await bannerItemsInOneRow(banner, 2));

    // Rolando, só a linha do menu fica presa no topo; a faixa sai da tela.
    const grid = page.locator(".day-grid-scroll");
    await expect(grid).toBeVisible();
    await grid.evaluate((element) => element.scrollIntoView());
    const menu = page.getByRole("button", { name: "Abrir menu", exact: true });
    await expect
      .poll(async () => {
        const [topbar, bannerBox, menuBox] = await Promise.all([
          page.locator(".topbar").boundingBox(),
          banner.boundingBox(),
          menu.boundingBox(),
        ]);
        const visible = topbar!.y + topbar!.height;
        return (
          bannerBox!.y + bannerBox!.height <= 1 &&
          menuBox!.y >= 0 &&
          visible <= 80
        );
      })
      .toBe(true);
    // A grade da Agenda (RV5) começa logo abaixo do topo à vista e vai até o fim da tela.
    await expect
      .poll(async () => {
        const [topbar, gridBox] = await Promise.all([
          page.locator(".topbar").boundingBox(),
          grid.boundingBox(),
        ]);
        const bottom = topbar!.y + topbar!.height;
        return (
          gridBox!.y >= bottom - 1 &&
          gridBox!.y <= bottom + 24 &&
          gridBox!.y + gridBox!.height <= viewport.height + 1 &&
          gridBox!.y + gridBox!.height >= viewport.height - 24
        );
      })
      .toBe(true);
  });

  test(`phone ${viewport.width}px: contract signature lines stay on one line`, async ({
    page,
    api,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Celular.");
    await page.setViewportSize(viewport);
    const patient = await seedTaggedPatient(api, "Cliente Contrato Celular");
    // RE17: o contrato padrão usa CNPJ, endereço, telefone e e-mail da clínica.
    const settings = await (await api.get("/admin/clinic-settings")).json();
    const clinic = await api.put("/admin/clinic-settings", {
      data: {
        ...settings,
        taxId: "11222333000181",
        address: "Av. Brasil, 500, Campinas/SP",
        phone: "19999990000",
        email: "contato@studio.com.br",
      },
    });
    expect(clinic.ok(), await clinic.text()).toBe(true);
    const template = await api.post("/document-templates", {
      data: {
        name: "Contrato padrão",
        kind: "contract",
        content: documentContentFromText(defaultContractTemplateBody),
      },
    });
    expect(template.status(), await template.text()).toBe(201);
    const issued = await api.post("/documents", {
      data: {
        templateId: (await template.json()).id,
        patientId: patient.id,
        title: "Contrato padrão",
      },
    });
    expect(issued.status(), await issued.text()).toBe(201);
    const documentId = (await issued.json()).id;
    expect(
      (
        await api.patch(`/documents/${documentId}/status`, {
          data: { status: "issued" },
        })
      ).ok(),
    ).toBe(true);
    const link = await api.post(`/documents/${documentId}/signature-link`);
    expect(link.ok()).toBe(true);
    await page.goto(`/assinar-contrato/${(await link.json()).token}`);
    const paper = page.locator(".public-signature-document .document-paper");
    await expect(paper).toContainText("CONTRATANTE");
    const lines = paper.locator(".document-signature-line");
    // Local, duas partes e duas testemunhas (nome e CPF).
    await expect(lines).toHaveCount(7);
    const paperBox = await box(paper);
    for (const line of await lines.all()) {
      const rects = await line.evaluate(
        (element) => element.getClientRects().length,
      );
      expect(rects).toBe(1);
      const lineBox = await box(line);
      const lineHeight = await line.evaluate((element) =>
        parseFloat(getComputedStyle(element.parentElement!).lineHeight),
      );
      expect(lineBox.height).toBeLessThanOrEqual(lineHeight + 1);
      expect(lineBox.x + lineBox.width).toBeLessThanOrEqual(
        paperBox.x + paperBox.width,
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
