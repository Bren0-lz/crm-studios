import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  documentPatientCpfRequiredMessage,
  patientImportInputSchema,
  patientUpdateInputSchema,
} from "@crm/contracts";
import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";
import { installDocumentBrowserMocks } from "../../test-support/document-editor";

vi.mock("./document-pdf", () => ({
  generateDocumentPdf: async () =>
    new Blob(["%PDF-1.7\nContract"], { type: "application/pdf" }),
}));

async function fixture() {
  const { repository } = await setupApi();
  installDocumentBrowserMocks();
  await repository.importPatients(clinicId, [
    patientImportInputSchema.parse({
      fullName: "Cliente CP3 sem CPF",
      phone: "11955551234",
      tags: [],
    }),
  ]);
  const [patient] = await repository.listPatients(
    clinicId,
    "Cliente CP3 sem CPF",
  );
  const template = await repository.createDocumentTemplate(clinicId, {
    name: "Contrato que exige CPF",
    kind: "contract",
    body: "Contrato para {{paciente_nome}}, CPF {{paciente_cpf}}, com as condições acordadas.",
  });
  return { repository, patient: patient!, template };
}

describe("CPF obrigatório nos contratos", () => {
  it("avisa, permite salvar rascunho e libera emissão ao preencher CPF e atualizar os dados", async () => {
    const { repository, patient, template } = await fixture();
    open(`/contratos?patientId=${patient.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo documento" }),
    );
    fireEvent.change(screen.getByLabelText("Modelo ativo"), {
      target: { value: template.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preparar conteúdo" }));
    expect(
      await screen.findByText(documentPatientCpfRequiredMessage),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Abrir cadastro do cliente" }),
    ).toHaveAttribute("href", `/clientes/${patient.id}`);
    fireEvent.click(screen.getByRole("button", { name: "Conferir PDF" }));
    const save = screen.getByRole("button", { name: "Criar rascunho" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(
      await screen.findByRole("button", { name: "Emitir" }),
    ).toBeDisabled();
    expect((await repository.listIssuedDocuments(clinicId))[0]?.status).toBe(
      "draft",
    );

    await repository.updatePatient(
      clinicId,
      patient.id,
      patientUpdateInputSchema.parse({ ...patient, cpf: nextTestCpf() }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Atualizar dados do cadastro" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(documentPatientCpfRequiredMessage),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("textbox", { name: "Conteúdo" }),
    ).not.toHaveTextContent("não informado");
    fireEvent.click(screen.getByRole("button", { name: "Conferir PDF" }));
    const update = screen.getByRole("button", { name: "Salvar alterações" });
    await waitFor(() => expect(update).toBeEnabled());
    fireEvent.click(update);
    const issue = await screen.findByRole("button", {
      name: "Emitir",
    });
    await waitFor(() => expect(issue).toBeEnabled());
    fireEvent.click(issue);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Emitir contrato" })).getByRole(
        "button",
        { name: "Emitir contrato" },
      ),
    );
    await waitFor(async () =>
      expect((await repository.listIssuedDocuments(clinicId))[0]?.status).toBe(
        "issued",
      ),
    );
  });

  it("mantém o aviso e o bloqueio quando o rascunho é reaberto", async () => {
    const { repository, patient, template } = await fixture();
    await repository.createIssuedDocument(clinicId, actorId, {
      patientId: patient.id,
      templateId: template.id,
      title: "Rascunho sem CPF",
    });
    open("/contratos");
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Ver detalhes de Rascunho sem CPF/,
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Revisar rascunho" }),
    );
    expect(
      await screen.findByText(documentPatientCpfRequiredMessage),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Conferir PDF" }));
    expect(screen.getByRole("button", { name: "Emitir" })).toBeDisabled();
  });

  it("bloqueia envio com CPF ausente e permite trocar para um modelo sem esse campo", async () => {
    const { repository, patient, template } = await fixture();
    const plain = await repository.createDocumentTemplate(clinicId, {
      name: "Contrato sem campo CPF",
      kind: "contract",
      body: "Contrato para {{paciente_nome}}, com as condições acordadas.",
    });
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
    expect(
      await within(dialog).findByText(documentPatientCpfRequiredMessage),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Emitir e gerar link" }),
    ).toBeDisabled();
    expect(await repository.listIssuedDocuments(clinicId)).toHaveLength(0);
    fireEvent.change(within(dialog).getByLabelText("Modelo do contrato"), {
      target: { value: plain.id },
    });
    const send = within(dialog).getByRole("button", {
      name: "Emitir e gerar link",
    });
    await waitFor(() => expect(send).toBeEnabled());
    expect(
      within(dialog).queryByText(documentPatientCpfRequiredMessage),
    ).not.toBeInTheDocument();
    fireEvent.click(send);
    expect(
      await within(dialog).findByRole("link", { name: /Abrir WhatsApp/ }),
    ).toBeInTheDocument();
  });
});
