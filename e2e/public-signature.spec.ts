import { test, expect, seedPatient, clinicToday } from "./fixtures.js";
import {
  canvasMatchesItsBox,
  drawSignature,
  iPhone,
  noHorizontalScroll,
} from "./signature-mobile.js";

test.use(iPhone);

test("the client checks and signs the payment receipt on an iPhone", async ({
  page,
  api,
  apiServer,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "Emulação de iPhone: basta rodar uma vez.",
  );
  const patient = await seedPatient(api, "Cliente Recibo iPhone");
  const created = await api.post("/finance/receivables", {
    data: {
      patientId: patient.id,
      description:
        "Mensalidade de Pilates com um nome bem comprido para quebrar",
      amountInCents: 18_000,
      dueDate: clinicToday(),
    },
  });
  expect(created.status()).toBe(201);
  const receivable = await created.json();
  const paid = await api.post(`/finance/receivables/${receivable.id}/pay`, {
    data: { paymentMethod: "pix" },
  });
  expect(paid.ok()).toBe(true);
  const [receipt] = await apiServer.repository.listReceiptSignatures(
    receivable.clinicId,
    receivable.id,
  );

  await page.goto(`/assinar-recibo/${receipt!.token}`);
  await expect(
    page.getByRole("heading", { name: "Recibo de pagamento", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Mensalidade de Pilates/)).toBeVisible();

  // 1. Nada passa da largura da tela.
  await noHorizontalScroll(page);

  // 2. O recibo termina antes do formulário (sem sobreposição).
  const content = page.locator(".public-signature-document .receipt-content");
  const contentBox = (await content.boundingBox())!;
  const formBox = (await page
    .getByRole("heading", { name: "Assinatura", exact: true })
    .boundingBox())!;
  expect(formBox.y).toBeGreaterThanOrEqual(contentBox.y + contentBox.height);

  // 3. Campos com 16 px ou mais: abaixo disso o Safari do iOS dá zoom ao tocar.
  for (const name of ["Nome completo", "CPF de quem assina"]) {
    const fontSize = await page
      .getByRole("textbox", { name, exact: true })
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    expect.soft(fontSize, name).toBeGreaterThanOrEqual(16);
  }
  await expect(
    page.getByRole("textbox", { name: "Nome completo", exact: true }),
  ).toHaveValue("Cliente Recibo iPhone");

  // 4. Assina com o dedo, também depois de girar o celular.
  await drawSignature(page);
  await canvasMatchesItsBox(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await canvasMatchesItsBox(page);
  await noHorizontalScroll(page);

  await page
    .getByRole("checkbox", {
      name: "Conferi o recibo e confirmo o pagamento descrito.",
      exact: true,
    })
    .check();
  const submit = page.getByRole("button", {
    name: "Assinar recibo",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  const request = page.waitForRequest(
    (item) =>
      item.method() === "POST" &&
      item.url().includes("/public/receipt-signatures/"),
  );
  await submit.click();
  const body = (await request).postDataJSON() as { signatureImage: string };
  expect(body.signatureImage.length).toBeLessThanOrEqual(700_000);
  await expect(page.getByRole("status")).toContainText(
    "Recibo assinado por Cliente Recibo iPhone",
  );

  // 5. O recibo assinado traz a assinatura e a data, pronto para imprimir/salvar em PDF.
  await expect(
    page.getByRole("img", {
      name: "Assinatura de Cliente Recibo iPhone",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".receipt-content figcaption")).toContainText(
    /Assinado por Cliente Recibo iPhone em \d{2} de/,
  );
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("button", { name: "Imprimir ou salvar PDF", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("img", {
      name: "Assinatura de Cliente Recibo iPhone",
      exact: true,
    }),
  ).toBeVisible();
  await page.emulateMedia({ media: "screen" });

  // 6. Reaberto depois: continua assinado, sem o formulário.
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "Recibo assinado por Cliente Recibo iPhone",
  );
  await expect(
    page.getByRole("button", { name: "Assinar recibo", exact: true }),
  ).toHaveCount(0);
});
