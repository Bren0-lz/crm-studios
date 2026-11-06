import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { patientInputSchema, saoPauloToday } from "@crm/contracts";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { installDocumentBrowserMocks } from "../../test-support/document-editor";
import { fillAppointmentForm } from "../../test-support/legacy-fixtures";
import { change, open } from "../../test-support/workflow-ui";
import { generateDocumentPdf } from "./document-pdf";

vi.mock("./document-pdf", () => ({
  generateDocumentPdf: vi.fn(
    async () => new Blob(["%PDF-1.7\nContract"], { type: "application/pdf" }),
  ),
}));

async function clientWithTemplate() {
  const api = await setupApi();
  installDocumentBrowserMocks();
  const patient = await api.repository.createPatient(
    clinicId,
    patientInputSchema.parse({
      cpf: nextTestCpf(),
      fullName: "Clara Assinante",
      phone: "11999995555",
      whatsapp: "11999995555",
      emergencyContactName: "Clara Assinante",
      emergencyContactPhone: "11999995555",
    }),
  );
  const template = await api.repository.createDocumentTemplate(clinicId, {
    name: "Termo de consentimento",
    kind: "consent",
    body: "Eu, {{paciente_nome}}, autorizo o atendimento com {{profissional_nome}}.",
  });
  return { ...api, patient, template };
}

describe("document signature on registration", () => {
  it("schedules the appointment and opens the signing link for WhatsApp in the same modal", async () => {
    const { repository, patient, template } = await clientWithTemplate();
    open("/agenda");
    fireEvent.click(
      await screen.findByRole("button", { name: /Novo atendimento/ }),
    );
    const dialog = screen.getByRole("dialog", { name: "Novo atendimento" });
    await fillAppointmentForm(dialog, patient.fullName);
    // Fora dos atendimentos demo de hoje (06:00 a 14:00 conforme o fuso).
    change("Horário", "19:00", dialog);
    const field = within(dialog).getByLabelText(
      "Documento para o cliente assinar",
    );
    await within(field).findByRole("option", {
      name: new RegExp(template.name),
    });
    change("Documento para o cliente assinar", template.id, dialog);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar atendimento" }),
    );

    const whatsapp = await within(dialog).findByRole("link", {
      name: "Abrir WhatsApp",
    });
    expect(whatsapp.getAttribute("href")).toContain("wa.me/5511999995555");
    const [appointment] = (
      await repository.listAppointments(
        clinicId,
        new Date(Date.now() - 30 * 86_400_000).toISOString(),
        new Date(Date.now() + 30 * 86_400_000).toISOString(),
      )
    ).filter((item) => item.patientId === patient.id);
    const [document] = await repository.listIssuedDocuments(clinicId);
    expect(document).toMatchObject({
      status: "issued",
      patientId: patient.id,
      templateId: template.id,
      title: template.name,
      professionalId: appointment!.professionalId,
    });
    expect(within(dialog).getByLabelText("Link de assinatura")).toHaveValue(
      `${window.location.origin}/assinar-contrato/${document!.signatureLink!.token}`,
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Concluir" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Novo atendimento" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("issues the document linked to the single plan created from the client record", async () => {
    const { repository, patient, template } = await clientWithTemplate();
    const [service] = await repository.listServices(clinicId);
    const single = await repository.createPlanTemplate(clinicId, actorId, {
      name: "Sessão avulsa assinada",
      kind: "single",
      totalValueInCents: 15000,
      services: [
        { serviceId: service!.id, totalSessions: 1, totalValueInCents: 15000 },
      ],
    });
    open(`/clientes/${patient.id}`);
    fireEvent.click(await screen.findByRole("tab", { name: "Planos" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Plano avulso" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Novo plano avulso",
    });
    await within(dialog).findByRole("option", {
      name: new RegExp(single.name),
    });
    change("Plano cadastrado", single.id, dialog);
    change("Parcelas", "1", dialog);
    change("Primeiro vencimento", saoPauloToday(), dialog);
    await within(
      within(dialog).getByLabelText("Documento para o cliente assinar"),
    ).findByRole("option", { name: new RegExp(template.name) });
    change("Documento para o cliente assinar", template.id, dialog);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Criar plano e parcelas" }),
    );
    expect(
      await within(dialog).findByRole("link", { name: "Abrir WhatsApp" }),
    ).toBeInTheDocument();
    const [plan] = (await repository.listPatientPlans(clinicId)).filter(
      (item) => item.patientId === patient.id,
    );
    expect(await repository.listIssuedDocuments(clinicId)).toMatchObject([
      {
        status: "issued",
        planId: plan!.id,
        templateId: template.id,
        signatureLink: { viewCount: 0 },
      },
    ]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Concluir" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Novo plano avulso" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows the contract signed by the client in the client record, with the signature in the PDF", async () => {
    const { repository, patient, template } = await clientWithTemplate();
    const draft = await repository.createIssuedDocument(clinicId, actorId, {
      patientId: patient.id,
      templateId: template.id,
      title: "Termo assinado",
    });
    await repository.updateIssuedDocumentStatus(clinicId, draft.id, "issued");
    const share = await repository.createDocumentSignatureLink(
      clinicId,
      actorId,
      draft.id,
    );
    await repository.signPublicDocument(
      share!.token,
      {
        signerName: patient.fullName,
        accepted: true,
        signerCpf: "52998224725",
        signatureImage: "data:image/png;base64,cG5n",
      },
      { ipAddress: "203.0.113.7" },
    );
    open(`/clientes/${patient.id}`);
    fireEvent.click(await screen.findByRole("tab", { name: "Contratos" }));
    expect(await screen.findByText("Assinado pelo link")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Ver contrato assinado" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Contrato assinado",
    });
    expect(
      await within(dialog).findByTitle("Prévia do PDF"),
    ).toBeInTheDocument();
    expect(generateDocumentPdf).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "Termo assinado",
        signature: expect.objectContaining({
          signerName: patient.fullName,
          signatureImage: "data:image/png;base64,cG5n",
          ipAddress: "203.0.113.7",
        }),
      }),
    );
  });
});
