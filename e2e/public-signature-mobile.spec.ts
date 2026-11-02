import { devices, type Page } from "@playwright/test";
import { test, expect, seedPatient } from "./fixtures.js";

// O link de assinatura é aberto pelo cliente no celular (reunião de 02/11/2026: iPhone/iOS 18).
// Só há Chromium no projeto: emulamos o iPhone (tela, densidade, toque e navegador).
const iPhone = { ...devices["iPhone 13"] };
delete (iPhone as { defaultBrowserType?: string }).defaultBrowserType;
test.use(iPhone);

const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

function longContract() {
  const clauses = Array.from({ length: 40 }, (_, index) =>
    paragraph(
      `Cláusula ${index + 1}. O cliente declara estar ciente das regras do estúdio, dos horários das aulas, da política de reposição e das condições de pagamento combinadas na contratação.`,
    ),
  );
  return {
    version: 1,
    doc: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [
            { type: "text", text: "Contrato de prestação de serviços" },
          ],
        },
        paragraph(
          `Endereço eletrônico: ${"https://studios.example/termos/".padEnd(60, "x")}`,
        ),
        ...clauses,
      ],
    },
  };
}

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function canvasMatchesItsBox(page: Page) {
  const size = await page
    .getByRole("img", { name: "Área de assinatura", exact: true })
    .evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      return {
        width: canvas.width,
        expected: Math.round(canvas.clientWidth * ratio),
      };
    });
  expect.soft(size.width).toBe(size.expected);
}

test("the client reads and signs a long contract on an iPhone", async ({
  page,
  api,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "Emulação de iPhone: basta rodar uma vez.",
  );
  const patient = await seedPatient(api, "Cliente Assinatura iPhone");
  const settings = await (await api.get("/admin/clinic-settings")).json();
  const branding = await api.put("/admin/clinic-settings", {
    data: {
      ...settings,
      logoDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    },
  });
  expect(branding.ok()).toBe(true);
  const template = await api.post("/document-templates", {
    data: { name: "Contrato longo", kind: "contract", content: longContract() },
  });
  expect(template.status()).toBe(201);
  const issued = await api.post("/documents", {
    data: {
      templateId: (await template.json()).id,
      patientId: patient.id,
      title: "Contrato longo",
    },
  });
  expect(issued.status()).toBe(201);
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
  const { token } = await link.json();

  await page.goto(`/assinar-contrato/${token}`);
  await expect(
    page.getByRole("heading", { name: "Contrato longo", exact: true }),
  ).toBeVisible();

  // 1. Nada passa da largura da tela.
  await noHorizontalScroll(page);

  // 2. O texto fica dentro da folha e a folha termina antes do formulário.
  const paper = page.locator(".public-signature-document .document-paper");
  const overflow = await paper.evaluate((element) => ({
    scroll: element.scrollHeight,
    client: element.clientHeight,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
  const paperBox = (await paper.boundingBox())!;
  const formTitle = page.getByRole("heading", {
    name: "Assinatura",
    exact: true,
  });
  const formBox = (await formTitle.boundingBox())!;
  expect(formBox.y).toBeGreaterThanOrEqual(paperBox.y + paperBox.height);

  // 3. Campos com 16 px ou mais: abaixo disso o Safari do iOS dá zoom ao tocar.
  for (const name of ["Nome completo", "CPF (opcional)"]) {
    const fontSize = await page
      .getByRole("textbox", { name, exact: true })
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect.soft(fontSize, name).toBeGreaterThanOrEqual(16);
  }

  // 4. A área de assinatura acompanha o tamanho da tela, também em paisagem.
  const pad = page.getByRole("img", {
    name: "Área de assinatura",
    exact: true,
  });
  await pad.scrollIntoViewIfNeeded();
  await canvasMatchesItsBox(page);

  // 5. O toque desenha em vez de rolar a página ou selecionar texto, e libera a assinatura.
  expect
    .soft(
      await pad.evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.touchAction, style.userSelect];
      }),
    )
    .toEqual(["none", "none"]);
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 30);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++)
    await page.mouse.move(box.x + 20 + step * 20, box.y + 30 + (step % 3) * 20);
  await page.mouse.up();

  await page.setViewportSize({ width: 844, height: 390 });
  await canvasMatchesItsBox(page);
  await noHorizontalScroll(page);

  await page
    .getByRole("checkbox", {
      name: "Li o documento e concordo com os seus termos.",
      exact: true,
    })
    .check();
  const submit = page.getByRole("button", {
    name: "Assinar documento",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  const request = page.waitForRequest(
    (item) =>
      item.method() === "POST" &&
      item.url().includes("/public/document-signatures/"),
  );
  await submit.click();
  const body = (await request).postDataJSON() as { signatureImage: string };
  expect(body.signatureImage.length).toBeLessThanOrEqual(700_000);
  await expect(page.getByRole("status")).toContainText(
    "Documento assinado por",
  );
});
