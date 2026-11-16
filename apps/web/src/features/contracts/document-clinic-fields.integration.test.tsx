import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { patientInputSchema } from "@crm/contracts";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { installDocumentBrowserMocks } from "../../test-support/document-editor";
import { open } from "../../test-support/workflow-ui";

vi.mock("./document-pdf", () => ({
  generateDocumentPdf: async () =>
    new Blob(["%PDF-1.7\nContract"], { type: "application/pdf" }),
}));

const missingMessage =
  "Cadastre CNPJ e endereço da clínica em Configurações › Clínica antes de emitir este contrato.";

async function fixture() {
  const { repository } = await setupApi();
  installDocumentBrowserMocks();
  const patient = await repository.createPatient(
    clinicId,
    patientInputSchema.parse({
      cpf: nextTestCpf(),
      fullName: "Cliente E6",
      phone: "11955556789",
      whatsapp: "11955556789",
      emergencyContactName: "Cliente E6",
      emergencyContactPhone: "11955556789",
      emergencyContactWhatsapp: "11955556789",
    }),
  );
  const settings = (await repository.getClinicSettings(clinicId))!;
  await repository.updateClinicSettings(clinicId, actorId, {
    ...settings,
    taxId: "",
    address: "",
    phone: "19999990000",
    email: "contato@studio.com.br",
  });
  const template = await repository.createDocumentTemplate(clinicId, {
    name: "Contrato com CNPJ",
    kind: "contract",
    body: "Contrato de {{paciente_nome}} com {{clinica_nome}}, CNPJ {{clinica_cnpj}}, sede em {{clinica_endereco}}, telefone {{clinica_telefone}}.",
  });
  const plain = await repository.createDocumentTemplate(clinicId, {
    name: "Contrato simples",
    kind: "contract",
    body: "Contrato de {{paciente_nome}} com {{clinica_nome}}, telefone {{clinica_telefone}}.",
  });
  async function fillClinic() {
    await repository.updateClinicSettings(clinicId, actorId, {
      ...(await repository.getClinicSettings(clinicId))!,
      taxId: "11222333000181",
      address: "Av. Brasil, 500, Campinas/SP",
    });
  }
  return { repository, patient, template, plain, fillClinic };
}

describe("contrato com dados da clínica faltando (E6)", () => {
  it("no Novo documento avisa ao escolher o modelo e só libera depois do cadastro", async () => {
    const { repository, patient, template, plain, fillClinic } =
      await fixture();
    open(`/contratos?patientId=${patient.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo documento" }),
    );
    fireEvent.change(screen.getByLabelText("Modelo ativo"), {
      target: { value: template.id },
    });
    expect(await screen.findByText(missingMessage)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Abrir Configurações › Clínica" }),
    ).toHaveAttribute("href", "/configuracoes");
    expect(
      screen.getByRole("button", { name: "Preparar conteúdo" }),
    ).toBeDisabled();

    // Modelo sem os campos vazios não é bloqueado.
    fireEvent.change(screen.getByLabelText("Modelo ativo"), {
      target: { value: plain.id },
    });
    expect(screen.queryByText(missingMessage)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preparar conteúdo" }),
    ).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Modelo ativo"), {
      target: { value: template.id },
    });
    await fillClinic();
    fireEvent.click(screen.getByRole("button", { name: "Verificar de novo" }));
    await waitFor(() =>
      expect(screen.queryByText(missingMessage)).not.toBeInTheDocument(),
    );
    const prepare = screen.getByRole("button", { name: "Preparar conteúdo" });
    expect(prepare).toBeEnabled();
    fireEvent.click(prepare);
    expect(
      await screen.findByRole("textbox", { name: "Conteúdo" }),
    ).toHaveTextContent("Av. Brasil, 500");
    expect(await repository.listIssuedDocuments(clinicId)).toHaveLength(0);
  });

  it("mostra o 409 da API quando o cadastro da clínica muda no meio do caminho", async () => {
    const { repository, patient, template, fillClinic } = await fixture();
    await fillClinic();
    open(`/contratos?patientId=${patient.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo documento" }),
    );
    fireEvent.change(screen.getByLabelText("Modelo ativo"), {
      target: { value: template.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preparar conteúdo" }));
    await screen.findByRole("textbox", { name: "Conteúdo" });
    await repository.updateClinicSettings(clinicId, actorId, {
      ...(await repository.getClinicSettings(clinicId))!,
      taxId: "",
      address: "",
    });
    fireEvent.click(screen.getByRole("button", { name: "Conferir PDF" }));
    const save = screen.getByRole("button", { name: "Criar rascunho" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(await screen.findByText(missingMessage)).toBeInTheDocument();
    expect(await repository.listIssuedDocuments(clinicId)).toHaveLength(0);
  });

  it("no Enviar pelo WhatsApp avisa e não emite com o modelo incompleto", async () => {
    const { repository, patient, template, plain } = await fixture();
    open(`/contratos?patientId=${patient.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enviar pelo WhatsApp" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Enviar para assinatura",
    });
    fireEvent.change(within(dialog).getByLabelText("Modelo do contrato"), {
      target: { value: template.id },
    });
    expect(await within(dialog).findByText(missingMessage)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Emitir e gerar link" }),
    ).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Modelo do contrato"), {
      target: { value: plain.id },
    });
    const send = within(dialog).getByRole("button", {
      name: "Emitir e gerar link",
    });
    await waitFor(() => expect(send).toBeEnabled());
    expect(within(dialog).queryByText(missingMessage)).not.toBeInTheDocument();
    expect(await repository.listIssuedDocuments(clinicId)).toHaveLength(0);
  });

  it("no cadastro com documento para assinar não oferece o modelo incompleto", async () => {
    await fixture();
    open("/agenda");
    fireEvent.click(
      await screen.findByRole("button", { name: /Novo atendimento/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo atendimento" });
    const field = within(dialog).getByLabelText(
      "Documento para o cliente assinar",
    );
    const blocked = await within(field).findByRole("option", {
      name: "Contrato com CNPJ · v1 (faltam dados da clínica)",
    });
    expect(blocked).toBeDisabled();
    expect(
      within(field).getByRole("option", { name: "Contrato simples · v1" }),
    ).toBeEnabled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      `Indisponível sem os dados da clínica: Contrato com CNPJ. ${missingMessage}`,
    );
  });
});
