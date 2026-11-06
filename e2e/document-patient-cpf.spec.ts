import { patientImportInputSchema } from "@crm/contracts";
import { test, expect, login } from "./fixtures.js";
import { drawSignature, noHorizontalScroll } from "./signature-mobile.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

test("CPF blocks required contract models and is mandatory for the signer", async ({
  page,
  api,
  apiServer,
}) => {
  await apiServer.repository.importPatients(clinicId, [
    patientImportInputSchema.parse({
      fullName: "Cliente importado CP3",
      phone: "11955551234",
      tags: [],
    }),
  ]);
  const [patient] = await apiServer.repository.listPatients(
    clinicId,
    "Cliente importado CP3",
  );
  const template = await api.post("/document-templates", {
    data: {
      name: "Contrato com CPF",
      kind: "contract",
      body: "Contrato de {{paciente_nome}}, CPF {{paciente_cpf}}, com as condições acordadas.",
    },
  });
  expect(template.ok()).toBe(true);
  const { id: templateId } = await template.json();
  const plain = await api.post("/document-templates", {
    data: {
      name: "Contrato sem campo CPF",
      kind: "contract",
      body: "Contrato de {{paciente_nome}} com as condições acordadas.",
    },
  });
  expect(plain.ok()).toBe(true);
  const { id: plainId } = await plain.json();

  await login(page);
  await page.goto(`/contratos?patientId=${patient!.id}`);
  await page
    .getByRole("button", { name: "Enviar pelo WhatsApp", exact: true })
    .click();
  const dialog = page.getByRole("dialog").filter({
    has: page.getByRole("heading", {
      name: "Enviar para assinatura",
      exact: true,
    }),
  });
  await dialog
    .getByRole("combobox", { name: "Modelo do contrato", exact: true })
    .selectOption(templateId);
  await expect(dialog.getByRole("alert")).toContainText(
    "Informe o CPF do cliente no cadastro",
  );
  await expect(
    dialog.getByRole("button", { name: "Emitir e gerar link", exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("link", {
      name: "Abrir cadastro do cliente",
      exact: true,
    }),
  ).toHaveAttribute("href", `/clientes/${patient!.id}`);
  await noHorizontalScroll(page);

  await dialog
    .getByRole("combobox", { name: "Modelo do contrato", exact: true })
    .selectOption(plainId);
  const send = dialog.getByRole("button", {
    name: "Emitir e gerar link",
    exact: true,
  });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(
    dialog.getByRole("link", { name: /Abrir WhatsApp/ }),
  ).toBeVisible();
  const [document] = await apiServer.repository.listIssuedDocuments(clinicId);
  expect(document?.signatureLink).toBeTruthy();
  await page.goto(`/assinar-contrato/${document!.signatureLink!.token}`);
  const cpf = page.getByRole("textbox", { name: /^CPF de quem assina/ });
  await expect(cpf).toHaveAttribute("required", "");
  await page
    .getByRole("checkbox", {
      name: "Li o documento e concordo com os seus termos.",
      exact: true,
    })
    .check();
  await drawSignature(page);
  const sign = page.getByRole("button", {
    name: "Assinar documento",
    exact: true,
  });
  await expect(sign).toBeDisabled();
  await cpf.fill("11111111111");
  await expect(sign).toBeDisabled();
  await cpf.fill("52998224725");
  await expect(sign).toBeEnabled();
  await sign.click();
  await expect(page.getByRole("status")).toContainText(
    "Documento assinado por",
  );
  expect(
    (await apiServer.repository.listPatients(clinicId, patient!.fullName))[0]
      ?.cpf,
  ).toBeUndefined();
});
