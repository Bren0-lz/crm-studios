import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

describe("aviso de recibos não assinados (RC5)", () => {
  it("o atalho do sino abre o Financeiro com o recorte de recibos não assinados", async () => {
    const api = await setupApi();
    const patient = await api.repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Marina Costa",
      phone: "11988887777",
      tags: [],
    });
    const receivable = (description: string) =>
      api.repository.createManualReceivable(clinicId, actorId, {
        patientId: patient.id,
        description,
        amountInCents: 16_000,
        dueDate: "2040-06-10",
        competence: "2040-06",
      });
    const signed = await receivable("Mensalidade assinada");
    const pending = await receivable("Mensalidade sem assinatura");
    for (const item of [signed, pending])
      await api.repository.settleReceivable(clinicId, actorId, item.id, "pix");
    const [receipt] = await api.repository.listReceiptSignatures(
      clinicId,
      signed.id,
    );
    await api.repository.signPublicReceiptSignature(
      receipt!.token,
      {
        signerName: "Marina Costa",
        accepted: true,
        signatureImage: "data:image/png;base64,iVBORw0KGgo=",
      },
      {},
    );

    open("/financeiro?recibo=nao-assinado");
    expect(
      await screen.findByText("Mensalidade sem assinatura"),
    ).toBeInTheDocument();
    const banner = await screen.findByRole("region", { name: "Alertas" });
    expect(
      within(banner).getByRole("button", { name: /Recibos não assinados/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Recibo não assinado/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Mensalidade assinada")).not.toBeInTheDocument();
  });

  it("explica que o aviso é imediato, sem controles de horário ou espera", async () => {
    await setupApi();
    open("/configuracoes");
    expect(
      await screen.findByText(/assim que o recibo é gerado/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Horário do aviso")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Sem assinatura há mais de (horas)"),
    ).not.toBeInTheDocument();
  });
});
