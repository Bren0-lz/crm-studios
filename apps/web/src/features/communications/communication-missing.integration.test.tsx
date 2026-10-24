import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

describe("communication buttons list what is missing (QM14)", () => {
  it("keeps 'Adicionar à fila' disabled until the client and the message are filled", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente da fila",
      phone: "11988887777",
      tags: [],
    });
    open("/comunicacoes?aba=fila");
    fireEvent.click(
      await screen.findByRole("tab", { name: "Mensagem individual" }),
    );
    const queue = await screen.findByRole("button", {
      name: "Adicionar à fila",
    });
    expect(queue).toBeDisabled();
    expect(queue).toHaveAccessibleDescription(
      "Falta: Cliente, Mensagem administrativa.",
    );
    fireEvent.change(screen.getByLabelText("Mensagem administrativa"), {
      target: { value: "   " },
    });
    expect(queue).toHaveAccessibleDescription(
      "Falta: Cliente, Mensagem administrativa.",
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Cliente" }), {
      target: { value: "Cliente da" },
    });
    fireEvent.click(
      await screen.findByRole("option", { name: new RegExp(patient.fullName) }),
    );
    expect(queue).toHaveAccessibleDescription(
      "Falta: Mensagem administrativa.",
    );
    fireEvent.change(screen.getByLabelText("Mensagem administrativa"), {
      target: { value: "Lembrete do horário" },
    });
    expect(queue).toBeEnabled();
    expect(queue).not.toHaveAttribute("aria-describedby");
  });

  it("keeps 'Gerar lembretes' disabled without a reminder type", async () => {
    await setupApi();
    open("/comunicacoes?aba=fila");
    fireEvent.click(await screen.findByRole("tab", { name: "Lembretes" }));
    const generate = await screen.findByRole("button", {
      name: "Gerar lembretes",
    });
    expect(generate).toBeEnabled();
    for (const name of [
      "Atendimentos",
      "Parcelas vencidas",
      "Aniversários",
      "Acompanhamento de NPS",
    ]) {
      const option = screen.getByRole("checkbox", { name });
      if ((option as HTMLInputElement).checked) fireEvent.click(option);
    }
    expect(generate).toBeDisabled();
    expect(generate).toHaveAccessibleDescription(
      "Falta: Pelo menos um tipo de lembrete.",
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Aniversários" }));
    expect(generate).toBeEnabled();
    expect(generate).not.toHaveAttribute("aria-describedby");
  });
});
