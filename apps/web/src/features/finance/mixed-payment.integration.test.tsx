import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open, save } from "../../test-support/workflow-ui";

async function receivableToSettle() {
  const { repository } = await setupApi();
  const patient = await repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Cliente do pagamento misto",
    phone: "11988887777",
    tags: [],
  });
  const [service] = await repository.listServices(clinicId);
  const template = await repository.createPlanTemplate(clinicId, actorId, {
    name: "Pacote misto",
    kind: "fixed_package",
    totalValueInCents: 30000,
    services: [
      { serviceId: service!.id, totalSessions: 3, totalValueInCents: 30000 },
    ],
  });
  await repository.createPatientPlan(clinicId, actorId, {
    planTemplateId: template.id,
    patientId: patient.id,
    name: template.name,
    kind: "fixed_package",
    services: template.services,
    validFrom: "2040-06-01",
    totalValueInCents: 30000,
    installments: 1,
    firstDueDate: "2040-06-10",
    paymentMethod: "pix",
  });
  open("/financeiro");
  const description = await screen.findByText("Pacote misto · 1/1");
  const row = description.closest<HTMLElement>(".finance-row")!;
  fireEvent.click(within(row).getByRole("button", { name: "Dar baixa" }));
  const dialog = screen.getByRole("dialog", { name: "Dar baixa na parcela" });
  fireEvent.click(within(dialog).getByLabelText(/Pagamento misto/));
  return { repository, dialog };
}

const money = (label: string, value: string, dialog: HTMLElement) =>
  fireEvent.change(within(dialog).getByLabelText(label), {
    target: { value },
  });

describe("mixed payment (pagamento misto)", () => {
  it("splits the installment between Pix and card in installments", async () => {
    const { repository, dialog } = await receivableToSettle();
    // Duas formas para começar; a forma única e o "Valor recebido" saem de cena.
    expect(
      within(dialog).queryByLabelText("Valor recebido"),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("Forma de pagamento 1")).toHaveValue(
      "pix",
    );
    expect(within(dialog).getByLabelText("Forma de pagamento 2")).toHaveValue(
      "card",
    );
    money("Valor da forma 1", "100,00", dialog);
    // A última forma em branco fica com o restante.
    expect(
      within(dialog)
        .getByLabelText("Valor da forma 2")
        .getAttribute("placeholder"),
    ).toMatch(/^R\$\s200,00$/);
    fireEvent.change(
      (await within(dialog).findAllByLabelText("Parcelamento (Cartão)"))[0]!,
      { target: { value: "2" } },
    );
    await save("Dar baixa na parcela", "Confirmar baixa");
    expect(
      await screen.findByText("Pagamento misto recebido em 2 formas."),
    ).toBeInTheDocument();
    const items = (await repository.getFinancialSummary(clinicId)).receivables
      .filter((item) => item.description.startsWith("Pacote misto"))
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    expect(items).toEqual([
      expect.objectContaining({
        status: "paid",
        amountInCents: 10000,
        paymentMethod: "pix",
      }),
      expect.objectContaining({
        description: "Pacote misto · 1/1 · parte 2",
        status: "paid",
        amountInCents: 20000,
        paymentMethod: "card",
        paymentInstallments: 2,
      }),
    ]);
  });

  it("adds a third method, blocks a total above the final value and keeps the rest open", async () => {
    const { repository, dialog } = await receivableToSettle();
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Adicionar forma/ }),
    );
    expect(within(dialog).getByLabelText("Forma de pagamento 3")).toHaveValue(
      "cash",
    );
    money("Valor da forma 1", "200,00", dialog);
    money("Valor da forma 2", "100,00", dialog);
    money("Valor da forma 3", "50,00", dialog);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar baixa" }),
    );
    expect(
      await within(dialog).findByText(
        "A soma das formas de pagamento não pode passar do valor final.",
      ),
    ).toBeInTheDocument();

    money("Valor da forma 3", "", dialog);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remover forma 3" }),
    );
    money("Valor da forma 2", "50,00", dialog);
    // Faltam R$ 50,00: viram saldo com vencimento.
    expect(within(dialog).getByText(/Pagamento parcial/)).toBeInTheDocument();
    await save("Dar baixa na parcela", "Confirmar baixa");
    await waitFor(async () =>
      expect(
        (await repository.getFinancialSummary(clinicId)).receivables
          .filter((item) => item.description.startsWith("Pacote misto"))
          .map((item) => [item.status, item.amountInCents, item.paymentMethod])
          .sort(),
      ).toEqual([
        ["open", 5000, undefined],
        ["paid", 20000, "pix"],
        ["paid", 5000, "card"],
      ]),
    );
  });
});
