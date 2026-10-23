import { test, expect, login, seedPatient, selectPatient } from "./fixtures.js";

test("prepares, edits, reviews, downloads and issues a visual contract", async ({
  page,
  api,
}, testInfo) => {
  const patient = await seedPatient(api, "Cliente Contrato Navegador");
  const settings = await (await api.get("/admin/clinic-settings")).json();
  const branding = await api.put("/admin/clinic-settings", {
    data: {
      ...settings,
      logoDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    },
  });
  expect(branding.ok()).toBe(true);
  await login(page);
  await page.goto("/contratos");
  await page
    .getByRole("button", { name: "Criar primeiro modelo", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Conteúdo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Conteúdo", exact: true }),
  ).not.toContainText("{{paciente_nome}}");
  await page.getByRole("button", { name: "Criar modelo", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Modelos", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Documentos", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo documento", exact: true })
    .click();
  const wizard = page.getByRole("dialog", {
    name: "Novo documento",
    exact: true,
  });
  await expect(
    wizard.getByRole("button", { name: "Preparar conteúdo", exact: true }),
  ).toBeDisabled();
  await selectPatient(wizard, patient.fullName);
  await wizard
    .getByRole("button", { name: "Preparar conteúdo", exact: true })
    .click();
  const editor = wizard.getByRole("textbox", { name: "Conteúdo", exact: true });
  await expect(editor).toContainText(patient.fullName);
  await expect(editor).not.toContainText("{{");
  await editor.press("Control+End");
  await editor.press("Enter");
  await editor.press("Enter");
  await wizard
    .getByRole("button", { name: "Lista numerada", exact: true })
    .click();
  await wizard
    .getByLabel("Alinhamento", { exact: true })
    .selectOption("justify");
  await wizard.getByRole("button", { name: "Negrito", exact: true }).click();
  await wizard.getByRole("button", { name: "Itálico", exact: true }).click();
  await wizard.getByRole("button", { name: "Sublinhado", exact: true }).click();
  await editor.focus();
  await page.keyboard.insertText(
    "Condição exclusiva do contrato deste cliente.",
  );
  await expect(
    editor.locator(
      "ol strong em u, ol u em strong, ol em strong u, ol u strong em, ol strong u em, ol em u strong",
    ),
  ).toContainText("Condição exclusiva");
  await wizard
    .getByRole("button", { name: "Conferir PDF", exact: true })
    .click();
  await expect(
    wizard.getByRole("link", { name: "Salvar PDF", exact: true }),
  ).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await wizard.getByRole("link", { name: "Salvar PDF", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(
    "Contrato de prestação de serviços.pdf",
  );
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const pdf = Buffer.concat(chunks).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf).toContain("/ToUnicode");
  expect(pdf).toContain("/Subtype /Image");
  expect(pdf.match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
  await page.screenshot({
    path: testInfo.outputPath("contract-review.png"),
    fullPage: true,
  });
  await wizard
    .getByRole("button", { name: "Criar rascunho", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Revisar rascunho",
    exact: true,
  });
  await expect(
    review.getByRole("button", { name: "Emitir", exact: true }),
  ).toBeEnabled();
  await review
    .locator(".modal-actions")
    .getByRole("button", { name: "Fechar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revisar rascunho", exact: true })
    .click();
  await expect(
    review.getByRole("textbox", { name: "Conteúdo", exact: true }),
  ).toContainText("Condição exclusiva");
  await review
    .getByRole("button", { name: "Conferir PDF", exact: true })
    .click();
  await expect(
    review.getByRole("button", { name: "Emitir", exact: true }),
  ).toBeEnabled();
  await review.getByRole("button", { name: "Emitir", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Emitir contrato", exact: true })
    .getByRole("button", { name: "Emitir contrato", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Emitido", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Revisar rascunho", exact: true }),
  ).toHaveCount(0);
  const documents = await (await api.get("/documents")).json();
  expect(documents[0]).toMatchObject({
    status: "issued",
    patientId: patient.id,
    templateVersion: 1,
  });
  expect(documents[0].snapshotBody).toContain("Condição exclusiva");
  const templates = await (await api.get("/document-templates")).json();
  expect(templates[0].body).not.toContain("Condição exclusiva");
  const row = page.locator(".issued-document-list > article").first();
  await row.getByText("Ver conteúdo", { exact: true }).click();
  const paper = row.locator(".document-paper");
  await expect(paper).toHaveCSS("display", "block");
  await expect(paper).toContainText("Condição exclusiva");
  await paper.screenshot({
    path: testInfo.outputPath("contract-document.png"),
  });
});
