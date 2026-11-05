import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import {
  documentEditor,
  setDocumentText,
} from "../../test-support/document-editor";
import { open, save } from "../../test-support/workflow-ui";

async function openReceivable(phone: string) {
  const api = await setupApi();
  const patient = await api.repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Marina Costa",
    phone,
    tags: [],
  });
  const receivable = await api.repository.createManualReceivable(
    clinicId,
    actorId,
    {
      patientId: patient.id,
      description: "Mensalidade de Pilates",
      amountInCents: 16_000,
      dueDate: "2040-06-10",
      competence: "2040-06",
    },
  );
  return { ...api, patient, receivable };
}

const rowOf = async (description: string) =>
  (await screen.findByText(description)).closest<HTMLElement>(".finance-row")!;

function messageOf(link: HTMLElement) {
  return decodeURIComponent(link.getAttribute("href")!.split("text=")[1]!);
}

describe("enviar recibo pelo WhatsApp", () => {
  it("na baixa, abre o wa.me com o link do recibo e registra o clique como envio", async () => {
    const { repository, receivable } = await openReceivable("11988887777");
    open("/financeiro");
    fireEvent.click(
      within(await rowOf("Mensalidade de Pilates")).getByRole("button", {
        name: "Dar baixa",
      }),
    );
    await save("Dar baixa na parcela", "Confirmar baixa");
    const notice = await screen.findByRole("region", {
      name: "Recibo da baixa",
    });
    expect(notice).toHaveTextContent(
      "Recibo de R$ 160,00 pronto para o cliente assinar.",
    );
    const link = within(notice).getByRole("link", {
      name: "Enviar recibo pelo WhatsApp",
    });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("href")).toMatch(
      /^https:\/\/wa\.me\/5511988887777\?text=/,
    );
    const [receipt] = await repository.listReceiptSignatures(
      clinicId,
      receivable.id,
    );
    expect(messageOf(link)).toMatch(
      new RegExp(
        `^Olá Marina, recebemos seu pagamento de R\\$ 160,00 em \\d{2}/\\d{2}/\\d{4}\\. Assine o recibo: ${window.location.origin}/assinar-recibo/${receipt!.token}$`,
      ),
    );
    expect(receipt!.sentAt).toBeUndefined();

    fireEvent.click(link);
    expect(
      await within(notice).findByText("Recibo enviado para assinatura."),
    ).toBeInTheDocument();
    const [sent] = await repository.listReceiptSignatures(
      clinicId,
      receivable.id,
    );
    expect(sent).toMatchObject({ status: "sent" });
    expect(sent!.sentAt).toEqual(expect.any(String));

    fireEvent.click(within(notice).getByRole("button", { name: "Dispensar" }));
    expect(
      screen.queryByRole("region", { name: "Recibo da baixa" }),
    ).not.toBeInTheDocument();
  });

  it("no recibo da parcela paga, usa o modelo da clínica", async () => {
    const { repository, receivable } = await openReceivable("11988887777");
    const settings = (await repository.getClinicSettings(clinicId))!;
    await repository.updateClinicSettings(clinicId, actorId, {
      ...settings,
      paymentReceiptMessageTemplate:
        "Oi {{nome}}! Valor {{valor}}. Assine: {{link_recibo}}",
    });
    await repository.settleReceivable(clinicId, actorId, receivable.id, "pix");
    open("/financeiro");
    fireEvent.click(
      within(await rowOf("Mensalidade de Pilates")).getByRole("button", {
        name: "Recibo",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Recibo de pagamento",
    });
    const link = within(dialog).getByRole("link", {
      name: "Enviar recibo pelo WhatsApp",
    });
    expect(
      within(dialog).queryByRole("link", { name: "Enviar por WhatsApp" }),
    ).not.toBeInTheDocument();
    const [receipt] = await repository.listReceiptSignatures(
      clinicId,
      receivable.id,
    );
    expect(messageOf(link)).toBe(
      `Oi Marina! Valor R$ 160,00. Assine: ${window.location.origin}/assinar-recibo/${receipt!.token}`,
    );
  });

  it("cliente sem número: botão desativado com a dica", async () => {
    const { repository, receivable } = await openReceivable("");
    await repository.settleReceivable(clinicId, actorId, receivable.id, "pix");
    open("/financeiro");
    fireEvent.click(
      within(await rowOf("Mensalidade de Pilates")).getByRole("button", {
        name: "Recibo",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Recibo de pagamento",
    });
    const button = within(dialog).getByRole("button", {
      name: "Enviar recibo pelo WhatsApp",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      "O cliente não tem WhatsApp nem telefone no cadastro.",
    );
  });

  it("edita a mensagem do recibo em Configurações com prévia", async () => {
    const { repository } = await setupApi();
    open("/configuracoes");
    const message = await screen.findByRole("textbox", {
      name: "Mensagem do recibo",
    });
    expect(
      screen.getByText(
        /^Prévia: Olá Marina, recebemos seu pagamento de R\$ 160,00 em 05\/11\/2026\. Assine o recibo: /,
      ),
    ).toBeInTheDocument();
    setDocumentText(message, "Oi {{nome}}! ");
    act(() => {
      documentEditor(message).commands.focus("end");
    });
    const toolbar = screen.getByRole("toolbar", {
      name: "Inserir dados na mensagem do recibo",
    });
    fireEvent.click(
      within(toolbar).getByRole("button", { name: "Inserir valor pago" }),
    );
    expect(screen.getByText("Prévia: Oi Marina! R$ 160,00")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar configurações" }),
    );
    await waitFor(async () =>
      expect(
        (await repository.getClinicSettings(clinicId))
          ?.paymentReceiptMessageTemplate,
      ).toBe("Oi {{nome}}! {{valor}}"),
    );
  });
});
