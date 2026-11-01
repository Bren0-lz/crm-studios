import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  actorId,
  captureDownloads,
  clinicId,
  setupApi,
} from "../../test-support/api-server";
import { open, change, save } from "../../test-support/workflow-ui";

describe("manual signature workflows", () => {
  it("attaches and downloads a manual signature without rewriting the issued snapshot", async () => {
    const { repository } = await setupApi();
    const [patient] = await repository.listPatients(clinicId);
    const template = await repository.createDocumentTemplate(clinicId, {
      name: "Consentimento",
      kind: "consent",
      body: "Consentimento de {{paciente_nome}} registrado externamente.",
    });
    const document = await repository.createIssuedDocument(clinicId, actorId, {
      patientId: patient!.id,
      templateId: template.id,
      title: "Consentimento do cliente",
    });
    await repository.updateIssuedDocumentStatus(
      clinicId,
      document.id,
      "issued",
    );
    const downloads = captureDownloads();
    open(`/contratos?patientId=${patient!.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: /Ver detalhes/ }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Registrar assinatura manual",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Registrar assinatura manual",
    });
    change("Responsável pela obtenção", "Equipe responsável", dialog);
    // Sem a cópia, o botão diz o que falta (QM14).
    expect(
      within(dialog).getByRole("button", { name: "Registrar assinatura" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Registrar assinatura" }),
    ).toHaveAccessibleDescription("Falta: Cópia do documento assinado.");
    const content = new TextEncoder().encode(
      "%PDF-1.7\nConsentimento assinado\n%%EOF",
    );
    const file = new File([content], "consentimento.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => content.buffer,
    });
    fireEvent.change(
      within(dialog).getByLabelText("Cópia do documento assinado"),
      { target: { files: [file] } },
    );
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Registrar assinatura" }),
      ).toBeEnabled(),
    );
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    await save("Registrar assinatura manual", "Registrar assinatura");
    const saved = (await repository.listIssuedDocuments(clinicId)).find(
      (item) => item.id === document.id,
    )!;
    expect(saved).toMatchObject({
      snapshotBody: document.snapshotBody,
      status: "issued",
      manualSignature: { responsibleName: "Equipe responsável" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Baixar cópia assinada" }),
    );
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.size).toBe(content.length);
  });
});
