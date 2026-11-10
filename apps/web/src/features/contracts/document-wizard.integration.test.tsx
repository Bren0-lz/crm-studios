import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { patientInputSchema } from "@crm/contracts";
import { api } from "../../api";
import { clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";
import {
  installDocumentBrowserMocks,
  setDocumentText,
} from "../../test-support/document-editor";

vi.mock("./document-pdf", () => ({
  generateDocumentPdf: async () =>
    new Blob(["%PDF-1.7\nContract"], { type: "application/pdf" }),
}));

describe("individual document preparation", () => {
  it("keeps edits after a failed save, prevents duplicate writes and reopens the saved draft", async () => {
    const { repository } = await setupApi();
    installDocumentBrowserMocks();
    const patient = await repository.createPatient(
      clinicId,
      patientInputSchema.parse({
        cpf: nextTestCpf(),
        fullName: "Cliente do contrato",
        phone: "11999991234",
        whatsapp: "11999991234",
        emergencyContactName: "Cliente do contrato",
        emergencyContactPhone: "11999991234",
      }),
    );
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "Modelo visual",
      kind: "contract",
      body: "Contrato do cliente {{paciente_nome}}. Condições combinadas.",
    });
    const create = vi.spyOn(api, "createDocument");
    create.mockRejectedValueOnce(
      new Error("Falha de conexão. Tente novamente."),
    );
    open(`/contratos?patientId=${patient.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo documento" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Preparar conteúdo" }));
    const body = await screen.findByRole("textbox", { name: "Conteúdo" });
    expect(body).toHaveTextContent(patient.fullName);
    const changed =
      "Contrato individual com condições exclusivas e organizadas.";
    setDocumentText(body, changed);
    fireEvent.click(screen.getByRole("button", { name: "Conferir PDF" }));
    const save = await screen.findByRole("button", { name: "Criar rascunho" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(
      await screen.findByText("Falha de conexão. Tente novamente."),
    ).toBeInTheDocument();
    expect(await repository.listIssuedDocuments(clinicId)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("textbox", { name: "Conteúdo" })).toHaveTextContent(
      changed,
    );
    fireEvent.click(screen.getByRole("button", { name: "Conferir PDF" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Criar rascunho" }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Criar rascunho" }));
    fireEvent.click(
      screen.queryByRole("button", { name: "Criar rascunho" }) ??
        screen.getByRole("button", { name: "Salvando…" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "Revisar rascunho" }),
      ).toBeInTheDocument(),
    );
    expect(create).toHaveBeenCalledTimes(2);
    expect(await repository.listIssuedDocuments(clinicId)).toHaveLength(1);
    expect(
      (await repository.listDocumentTemplates(clinicId)).find(
        (item) => item.id === template.id,
      )?.body,
    ).toBe(template.body);
    fireEvent.click(screen.getByText("Fechar", { selector: "button" }));
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhes/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Revisar rascunho" }),
    );
    expect(
      await screen.findByRole("textbox", { name: "Conteúdo" }),
    ).toHaveTextContent(changed);
    setDocumentText(
      screen.getByRole("textbox", { name: "Conteúdo" }),
      `${changed} Ajuste não salvo.`,
    );
    fireEvent.click(screen.getByText("Fechar", { selector: "button" }));
    expect(
      screen.getByRole("dialog", { name: "Descartar alterações?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(screen.getByRole("textbox", { name: "Conteúdo" })).toHaveTextContent(
      "Ajuste não salvo.",
    );
  });
  it("returns to earlier steps by clicking the step numbers", async () => {
    const { repository } = await setupApi();
    installDocumentBrowserMocks();
    const patient = await repository.createPatient(
      clinicId,
      patientInputSchema.parse({
        cpf: nextTestCpf(),
        fullName: "Cliente das etapas",
        phone: "11999991234",
        whatsapp: "11999991234",
        emergencyContactName: "Cliente das etapas",
        emergencyContactPhone: "11999991234",
      }),
    );
    await repository.createDocumentTemplate(clinicId, {
      name: "Modelo das etapas",
      kind: "contract",
      body: "Contrato do cliente {{paciente_nome}}. Condições combinadas.",
    });
    open(`/contratos?patientId=${patient.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo documento" }),
    );
    expect(
      screen.queryByRole("button", { name: /Voltar para a etapa/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preparar conteúdo" }));
    const body = await screen.findByRole("textbox", { name: "Conteúdo" });
    const changed = "Contrato ajustado antes de voltar pelas etapas do modal.";
    setDocumentText(body, changed);
    fireEvent.click(screen.getByRole("button", { name: "Conferir PDF" }));
    await screen.findByRole("button", { name: "Criar rascunho" });
    fireEvent.click(
      screen.getByRole("button", { name: "Voltar para a etapa Conteúdo" }),
    );
    expect(screen.getByRole("textbox", { name: "Conteúdo" })).toHaveTextContent(
      changed,
    );
    expect(
      screen.queryByRole("button", { name: "Voltar para a etapa Revisão" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Conferir PDF" }));
    await screen.findByRole("button", { name: "Criar rascunho" });
    fireEvent.click(
      screen.getByRole("button", { name: "Voltar para a etapa Dados" }),
    );
    expect(screen.getByLabelText("Modelo ativo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preparar conteúdo" }));
    expect(
      await screen.findByRole("textbox", { name: "Conteúdo" }),
    ).toHaveTextContent(changed);
  });
  it("confirms replacement when selected data changes after individual editing", async () => {
    const { repository } = await setupApi();
    installDocumentBrowserMocks();
    const patient = await repository.createPatient(
      clinicId,
      patientInputSchema.parse({
        cpf: nextTestCpf(),
        fullName: "Cliente da revisão",
        phone: "11999991234",
        whatsapp: "11999991234",
        emergencyContactName: "Cliente da revisão",
        emergencyContactPhone: "11999991234",
      }),
    );
    const first = await repository.createDocumentTemplate(clinicId, {
      name: "Primeiro modelo",
      kind: "contract",
      body: "Primeiro contrato para {{paciente_nome}}. Condições combinadas.",
    });
    const other = await repository.createDocumentTemplate(clinicId, {
      name: "Segundo modelo",
      kind: "contract",
      body: "Segundo contrato para {{paciente_nome}}. Condições atualizadas.",
    });
    open(`/contratos?patientId=${patient.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: "Novo documento" }),
    );
    fireEvent.change(screen.getByLabelText("Modelo ativo"), {
      target: { value: first.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preparar conteúdo" }));
    setDocumentText(
      await screen.findByRole("textbox", { name: "Conteúdo" }),
      "Este ajuste pertence apenas ao contrato deste cliente.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    fireEvent.change(screen.getByLabelText("Modelo ativo"), {
      target: { value: other.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preparar conteúdo" }));
    const confirm = screen.getByRole("dialog", { name: "Atualizar conteúdo?" });
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Atualizar conteúdo" }),
    );
    expect(
      await screen.findByRole("textbox", { name: "Conteúdo" }),
    ).toHaveTextContent("Segundo contrato");
    expect(
      screen.getByRole("textbox", { name: "Conteúdo" }),
    ).not.toHaveTextContent("Este ajuste");
  });
});
