import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open, save } from "../../test-support/workflow-ui";

describe("baixa picada no Financeiro", () => {
  it("recebe parte no Pix e parte no cartão, deixando o saldo como nova parcela", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Rita Picada",
      phone: "11988887777",
      tags: [],
    });
    await repository.createManualReceivable(clinicId, actorId, {
      patientId: patient.id,
      description: "Pacote picado",
      amountInCents: 10_000,
      dueDate: "2040-06-10",
      competence: "2040-06",
    });
    open("/financeiro");
    const description = await screen.findByText("Pacote picado");
    const row = description.closest<HTMLElement>(".finance-row")!;
    fireEvent.click(within(row).getByRole("button", { name: "Dar baixa" }));
    const dialog = screen.getByRole("dialog", { name: "Dar baixa na parcela" });
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Adicionar forma de pagamento",
      }),
    );
    // Picado: o valor recebido é a soma das formas (sem o campo único).
    expect(within(dialog).queryByLabelText("Valor recebido")).toBeNull();
    fireEvent.change(
      within(dialog).getByLabelText("Forma de pagamento recebida 2"),
      { target: { value: "card" } },
    );
    fireEvent.change(within(dialog).getByLabelText("Valor da forma 1"), {
      target: { value: "4000" },
    });
    fireEvent.change(within(dialog).getByLabelText("Valor da forma 2"), {
      target: { value: "3000" },
    });
    expect(dialog).toHaveTextContent(/Pagamento parcial/);
    await save("Dar baixa na parcela", "Confirmar baixa");
    await waitFor(async () => {
      const items = (
        await repository.getFinancialSummary(clinicId)
      ).receivables.filter((item) => item.patientId === patient.id);
      expect(items.find((item) => item.status === "paid")).toMatchObject({
        amountInCents: 7_000,
        paymentParts: [
          { paymentMethod: "pix", amountInCents: 4_000 },
          { paymentMethod: "card", amountInCents: 3_000 },
        ],
      });
      expect(items.find((item) => item.status === "open")).toMatchObject({
        amountInCents: 3_000,
      });
    });
    expect(
      await screen.findByText(/Pago: Pix R\$\s40,00 \+ Cartão R\$\s30,00/),
    ).toBeInTheDocument();
  });
});
