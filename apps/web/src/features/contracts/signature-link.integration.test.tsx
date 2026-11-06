import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  documentSignatureMessage,
  patientInputSchema,
  whatsappLink,
} from "@crm/contracts";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";
import { installDocumentBrowserMocks } from "../../test-support/document-editor";

vi.mock("./document-pdf", () => ({
  generateDocumentPdf: async () =>
    new Blob(["%PDF-1.7\nContract"], { type: "application/pdf" }),
}));

async function clientWithTemplates() {
  const api = await setupApi();
  installDocumentBrowserMocks();
  const patient = await api.repository.createPatient(
    clinicId,
    patientInputSchema.parse({
      cpf: nextTestCpf(),
      fullName: "Breno Assinante",
      phone: "11999991234",
      whatsapp: "11999991234",
      emergencyContactName: "Breno Assinante",
      emergencyContactPhone: "11999991234",
    }),
  );
  await api.repository.createDocumentTemplate(clinicId, {
    name: "Contrato Pilates",
    kind: "contract",
    body: "Contrato de {{paciente_nome}} para as aulas de Pilates.",
  });
  const dance = await api.repository.createDocumentTemplate(clinicId, {
    name: "Contrato Dançaterapia",
    kind: "contract",
    body: "Contrato de {{paciente_nome}} para as aulas de dançaterapia.",
  });
  return { ...api, patient, dance };
}

describe("contract signature link", () => {
  it("lets the team choose the contract template and send the signing link by WhatsApp", async () => {
    const { repository, patient, dance } = await clientWithTemplates();
    open(`/contratos?patientId=${patient.id}`);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enviar pelo WhatsApp" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Enviar para assinatura",
    });
    fireEvent.change(within(dialog).getByLabelText("Modelo do contrato"), {
      target: { value: dance.id },
    });
    fireEvent.click(await within(dialog).findByText("Conferir o contrato"));
    expect(
      within(dialog).getByText(/aulas de dançaterapia/),
    ).toBeInTheDocument();
    const send = within(dialog).getByRole("button", {
      name: "Emitir e gerar link",
    });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);

    const whatsapp = await within(dialog).findByRole("link", {
      name: /Abrir WhatsApp/,
    });
    const [document] = await repository.listIssuedDocuments(clinicId);
    expect(document).toMatchObject({
      status: "issued",
      templateId: dance.id,
      title: "Contrato Dançaterapia",
    });
    const link = `${window.location.origin}/assinar-contrato/${document!.signatureLink!.token}`;
    expect(whatsapp).toHaveAttribute(
      "href",
      whatsappLink(
        patient.phone,
        documentSignatureMessage({
          patientName: patient.fullName,
          clinicName: "Studios Aryana",
          link,
        }),
      ),
    );
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(within(dialog).getByLabelText("Link de assinatura")).toHaveValue(
      link,
    );
    expect(
      (within(dialog).getByLabelText("Mensagem") as HTMLTextAreaElement).value,
    ).toContain("Olá Breno");
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(
      await screen.findByText("Aguardando assinatura", {
        selector: ".status-pill",
      }),
    ).toBeInTheDocument();
    // O registro do link fica nos detalhes do documento.
    fireEvent.click(screen.getByRole("button", { name: /Ver detalhes/ }));
    const details = await screen.findByRole("dialog");
    expect(
      within(details).getByText(/Ainda não visualizado/),
    ).toBeInTheDocument();
    expect(within(details).getByText(/Vale até/)).toBeInTheDocument();
  });

  it("opens the contract without login, records the view and the drawn signature", async () => {
    const { repository, patient, dance } = await clientWithTemplates();
    const draft = await repository.createIssuedDocument(clinicId, actorId, {
      patientId: patient.id,
      templateId: dance.id,
      title: "Contrato Dançaterapia",
    });
    await repository.updateIssuedDocumentStatus(clinicId, draft.id, "issued");
    const share = await repository.createDocumentSignatureLink(
      clinicId,
      actorId,
      draft.id,
    );
    localStorage.clear();
    const context = {
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,cG5n",
    );
    open(`/assinar-contrato/${share!.token}`);
    expect(
      await screen.findByRole("heading", { name: "Contrato Dançaterapia" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/aulas de dançaterapia/)).toBeInTheDocument();
    expect(screen.getByLabelText("Nome completo")).toHaveValue(
      patient.fullName,
    );
    const cpf = screen.getByLabelText("CPF de quem assina");
    fireEvent.change(cpf, { target: { value: "52998224725" } });
    expect(cpf).toHaveValue("529.982.247-25");
    const sign = screen.getByRole("button", { name: "Assinar documento" });
    expect(sign).toBeDisabled();
    const pad = screen.getByRole("img", { name: "Área de assinatura" });
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(pad, { clientX: 40, clientY: 30 });
    fireEvent.pointerUp(pad);
    fireEvent.click(
      screen.getByLabelText("Li o documento e concordo com os seus termos."),
    );
    fireEvent.change(cpf, { target: { value: "" } });
    expect(sign).toBeDisabled();
    fireEvent.change(cpf, { target: { value: "11111111111" } });
    expect(sign).toBeDisabled();
    fireEvent.change(cpf, { target: { value: "52998224725" } });
    await waitFor(() => expect(sign).toBeEnabled());
    fireEvent.click(sign);
    expect(
      await screen.findByText(/Documento assinado por Breno Assinante/),
    ).toBeInTheDocument();

    const details = await repository.getDocumentSignatureLink(
      clinicId,
      draft.id,
    );
    expect(details).toMatchObject({
      viewCount: 1,
      signerName: patient.fullName,
      signerCpf: "52998224725",
      signatureImage: "data:image/png;base64,cG5n",
    });
  });

  it("keeps the signature when the touch is cancelled or the pad changes size", async () => {
    const { repository, patient, dance } = await clientWithTemplates();
    const draft = await repository.createIssuedDocument(clinicId, actorId, {
      patientId: patient.id,
      templateId: dance.id,
      title: "Contrato Dançaterapia",
    });
    await repository.updateIssuedDocumentStatus(clinicId, draft.id, "issued");
    const share = await repository.createDocumentSignatureLink(
      clinicId,
      actorId,
      draft.id,
    );
    localStorage.clear();
    const context = {
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,cG5n",
    );
    let resized = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    try {
      open(`/assinar-contrato/${share!.token}`);
      await screen.findByRole("heading", { name: "Contrato Dançaterapia" });
      fireEvent.click(
        screen.getByLabelText("Li o documento e concordo com os seus termos."),
      );
      fireEvent.change(screen.getByLabelText("CPF de quem assina"), {
        target: { value: "52998224725" },
      });
      const sign = screen.getByRole("button", { name: "Assinar documento" });
      const pad = screen.getByRole("img", {
        name: "Área de assinatura",
      }) as HTMLCanvasElement;
      // O iOS cancela o toque (gesto do sistema) no meio do traço.
      fireEvent.pointerDown(pad, { clientX: 10, clientY: 10 });
      fireEvent.pointerMove(pad, { clientX: 40, clientY: 30 });
      fireEvent.pointerCancel(pad);
      await waitFor(() => expect(sign).toBeEnabled());

      // Girar o celular: a área cresce, a resolução acompanha e o traço é redesenhado.
      Object.defineProperty(pad, "clientWidth", {
        configurable: true,
        value: 600,
      });
      Object.defineProperty(pad, "clientHeight", {
        configurable: true,
        value: 192,
      });
      context.lineTo.mockClear();
      act(() => resized());
      expect(pad.width).toBe(600 * Math.min(window.devicePixelRatio || 1, 2));
      expect(context.lineTo).toHaveBeenCalled();
      expect(sign).toBeEnabled();

      fireEvent.click(
        screen.getByRole("button", { name: "Limpar assinatura" }),
      );
      await waitFor(() => expect(sign).toBeDisabled());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("shows a friendly message for an unknown link", async () => {
    await setupApi();
    localStorage.clear();
    open("/assinar-contrato/link-invalido");
    expect(await screen.findByText("Link indisponível")).toBeInTheDocument();
  });

  it("tells the client when the link expired without recording the view", async () => {
    const { repository, patient, dance } = await clientWithTemplates();
    const draft = await repository.createIssuedDocument(clinicId, actorId, {
      patientId: patient.id,
      templateId: dance.id,
      title: "Contrato Dançaterapia",
    });
    await repository.updateIssuedDocumentStatus(clinicId, draft.id, "issued");
    const share = await repository.createDocumentSignatureLink(
      clinicId,
      actorId,
      draft.id,
    );
    const later = new Date(Date.now() + 8 * 86_400_000);
    vi.useFakeTimers({ toFake: ["Date"], now: later });
    try {
      localStorage.clear();
      open(`/assinar-contrato/${share!.token}`);
      expect(await screen.findByText("Link expirado")).toBeInTheDocument();
      expect(
        screen.getByText("Este link expirou. Peça um novo à clínica."),
      ).toBeInTheDocument();
      expect(
        (await repository.getDocumentSignatureLink(clinicId, draft.id))
          ?.viewCount,
      ).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
