import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { test, expect, login, seedPatient, clinicToday } from "./fixtures.js";

// RF9 (D1): em 1192px a tabela de Contas a receber não rola por dentro; cada linha mostra uma
// ação principal ("Dar baixa" em aberto, "Recibo" paga) e as demais ficam no menu "Mais".
const desktop = { width: 1192, height: 860 };
const phones = [
  { width: 440, height: 860 },
  { width: 360, height: 780 },
];

async function box(locator: Locator) {
  const result = await locator.boundingBox();
  expect(result).not.toBeNull();
  return result!;
}

/** O elemento mostra o conteúdo inteiro (sem reticências nem rolagem interna). */
async function notTruncated(locator: Locator) {
  const size = await locator.evaluate((element) => ({
    scroll: element.scrollWidth,
    client: element.clientWidth,
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.client + 1);
}

const pdf = Buffer.from("%PDF-1.4\nComprovante\n%%EOF");

/**
 * Plano de 3 parcelas: 1ª paga com comprovante; 2ª paga com comprovante e estornada (em aberto,
 * com o comprovante da baixa estornada); 3ª em aberto sem comprovante.
 */
async function seedReceivables(api: APIRequestContext) {
  const patient = await seedPatient(api, "Maria Aparecida dos Santos Oliveira");
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
  const workspace = await (await api.get("/finance/workspace")).json();
  const [paid, reversed, open] = workspace.summary.receivables
    .filter((item: { patientId: string }) => item.patientId === patient.id)
    .sort((a: { dueDate: string }, b: { dueDate: string }) =>
      a.dueDate.localeCompare(b.dueDate),
    );
  for (const item of [paid, reversed]) {
    const pay = await api.post(`/finance/receivables/${item.id}/pay`, {
      data: { paymentMethod: "pix" },
    });
    expect(pay.status(), await pay.text()).toBe(200);
    const proof = await api.post(`/finance/receivables/${item.id}/proofs`, {
      data: {
        fileName: "pix.pdf",
        mimeType: "application/pdf",
        sizeInBytes: pdf.length,
        contentBase64: pdf.toString("base64"),
      },
    });
    expect(proof.status(), await proof.text()).toBe(201);
  }
  const reverse = await api.post(
    `/finance/receivables/${reversed.id}/reverse`,
    { data: { reason: "Baixa lançada por engano" } },
  );
  expect(reverse.status(), await reverse.text()).toBe(200);
  return {
    patient,
    paid: paid as { description: string },
    reversed: reversed as { description: string },
    open: open as { description: string },
  };
}

function rowOf(page: Page, description: string) {
  return page
    .locator(".receivables-table > .finance-row")
    .filter({ has: page.getByTitle(description, { exact: true }) });
}

/** Ações visíveis da linha, na ordem: os rótulos acessíveis dos botões. */
async function actionNames(row: Locator) {
  return row
    .locator(".finance-actions button")
    .evaluateAll((buttons) =>
      buttons.map(
        (button) => button.getAttribute("aria-label") ?? button.textContent,
      ),
    );
}

/** Abre o "Mais" da linha, confere os itens (inteiros e à vista) e fecha com Esc. */
async function expectMenu(page: Page, row: Locator, items: string[]) {
  await row.getByRole("button", { name: /^Mais ações/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText(items);
  for (const item of await menu.getByRole("menuitem").all()) {
    await expect(item).toBeInViewport({ ratio: 1 });
    await notTruncated(item);
  }
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
}

/** Todos os botões de ação da linha numa fileira só, inteiros e dentro da área. */
async function oneActionRow(row: Locator, area: { x: number; width: number }) {
  const tops = new Set<number>();
  for (const button of await row.locator(".finance-actions button").all()) {
    await notTruncated(button);
    const buttonBox = await box(button);
    tops.add(Math.round(buttonBox.y));
    expect(buttonBox.x).toBeGreaterThanOrEqual(area.x - 1);
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(
      area.x + area.width + 1,
    );
  }
  expect([...tops]).toHaveLength(1);
}

test("desktop 1192px: one main action per row, the others in the More menu", async ({
  page,
  api,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Largura do computador.");
  await page.setViewportSize(desktop);
  const seeded = await seedReceivables(api);
  await login(page);
  await page.goto("/financeiro");
  await expect(
    page
      .locator(".receivables-table > .finance-row")
      .filter({ hasText: seeded.patient.fullName }),
  ).toHaveCount(3);
  const paid = rowOf(page, seeded.paid.description);
  const reversed = rowOf(page, seeded.reversed.description);
  const open = rowOf(page, seeded.open.description);
  await expect(paid).toContainText("Paga");
  await expect(reversed).toContainText("Em aberto");

  // Uma ação principal à vista e o "Mais" (com o texto "Mais") em cada linha.
  expect(await actionNames(open)).toEqual([
    `Mais ações de ${seeded.open.description}`,
    "Dar baixa",
  ]);
  expect(await actionNames(reversed)).toEqual([
    `Mais ações de ${seeded.reversed.description}`,
    "Dar baixa",
  ]);
  expect(await actionNames(paid)).toEqual([
    `Mais ações de ${seeded.paid.description}`,
    "Recibo",
  ]);
  await expect(open.getByRole("button", { name: /^Mais ações/ })).toHaveText(
    "Mais",
  );

  // Sem rolagem interna: nem a tabela nem o painel rolam para o lado.
  const table = page.locator(".receivables-table");
  await notTruncated(table);
  await notTruncated(page.locator(".panel").filter({ has: table }));
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const area = await box(table);
  for (const row of [open, reversed, paid]) await oneActionRow(row, area);

  // Itens do "Mais" de cada tipo de linha.
  await expectMenu(page, open, ["Entrar em contato", "Ajustar"]);
  await expectMenu(page, reversed, [
    "Entrar em contato",
    "Ajustar",
    "Comprovantes",
  ]);
  await expectMenu(page, paid, ["Comprovantes", "Estornar"]);

  // As ações do menu abrem os mesmos modais de antes.
  await open.getByRole("button", { name: /^Mais ações/ }).click();
  await page.getByRole("menuitem", { name: "Ajustar", exact: true }).click();
  const adjust = page.getByRole("dialog", {
    name: "Ajustar valor da parcela",
    exact: true,
  });
  await expect(adjust).toBeVisible();
  await adjust.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(adjust).toHaveCount(0);
  await paid.getByRole("button", { name: /^Mais ações/ }).click();
  await page.getByRole("menuitem", { name: "Estornar", exact: true }).click();
  const reverse = page.getByRole("dialog", {
    name: "Estornar pagamento",
    exact: true,
  });
  await expect(reverse).toBeVisible();
  await expect(reverse.getByLabel("Motivo")).toBeVisible();
});

for (const phone of phones) {
  test(`phone ${phone.width}px: receivable cards keep actions whole with the More menu`, async ({
    page,
    api,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Largura do celular.");
    await page.setViewportSize(phone);
    const seeded = await seedReceivables(api);
    await login(page);
    await page.goto("/financeiro");
    const paid = rowOf(page, seeded.paid.description);
    const reversed = rowOf(page, seeded.reversed.description);
    await expect(paid).toContainText("Paga");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    for (const row of [reversed, paid]) {
      await row.scrollIntoViewIfNeeded();
      await oneActionRow(row, await box(row));
    }
    await expectMenu(page, reversed, [
      "Entrar em contato",
      "Ajustar",
      "Comprovantes",
    ]);
    await expectMenu(page, paid, ["Comprovantes", "Estornar"]);
  });
}
