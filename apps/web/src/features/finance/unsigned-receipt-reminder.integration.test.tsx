import { fireEvent, screen, waitFor } from "@testing-library/react";
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
    expect(
      screen.getByRole("button", { name: /^Recibo não assinado/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Mensalidade assinada")).not.toBeInTheDocument();
  });

  it("configura frequência, dia, horário e horas em Configurações › Clínica", async () => {
    const { repository } = await setupApi();
    open("/configuracoes");
    const frequency = await screen.findByRole("combobox", {
      name: "Aviso de recibos não assinados",
    });
    // Padrão provisório (RC6): todos os dias às 18:00, 24 horas sem assinar.
    expect(frequency).toHaveValue("daily");
    expect(screen.getByLabelText("Horário do aviso")).toHaveValue("18:00");
    expect(
      screen.getByLabelText("Sem assinatura há mais de (horas)"),
    ).toHaveValue(24);
    expect(screen.queryByLabelText("Dia do aviso")).not.toBeInTheDocument();

    fireEvent.change(frequency, { target: { value: "weekly" } });
    fireEvent.change(screen.getByLabelText("Dia do aviso"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Horário do aviso"), {
      target: { value: "09:30" },
    });
    fireEvent.change(
      screen.getByLabelText("Sem assinatura há mais de (horas)"),
      { target: { value: "48" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar configurações" }),
    );
    await waitFor(async () =>
      expect(
        (await repository.getClinicSettings(clinicId))?.receiptReminder,
      ).toEqual({
        frequency: "weekly",
        weekday: 5,
        time: "09:30",
        afterHours: 48,
      }),
    );

    // Desligado: some o horário e as horas, e a dica explica.
    fireEvent.change(frequency, { target: { value: "off" } });
    expect(screen.queryByLabelText("Horário do aviso")).not.toBeInTheDocument();
    expect(frequency).toHaveAccessibleDescription(
      "Desligado: o sino e a faixa de alertas não avisam sobre recibos sem assinatura.",
    );
  });
});
