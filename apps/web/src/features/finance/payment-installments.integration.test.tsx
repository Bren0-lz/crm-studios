import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { change, open, save } from "../../test-support/workflow-ui";

const restricted = [
  { method: "pix" as const, acceptsInstallments: false, maxInstallments: 1 },
  { method: "card" as const, acceptsInstallments: true, maxInstallments: 6 },
];

describe("installments by payment method", () => {
  it("admin chooses which methods accept installments and up to how many", async () => {
    const { repository } = await setupApi();
    open("/configuracoes?secao=pagamentos");
    const pix = (await screen.findByText("Pix", { selector: "strong" }))
      .parentElement!;
    fireEvent.click(within(pix).getByLabelText("Aceita parcelamento"));
    expect(
      within(pix).getByText("Só à vista", { selector: "span" }),
    ).toBeInTheDocument();
    change("Máximo de parcelas: Cartão", "6");
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar formas de pagamento" }),
    );
    expect(
      await screen.findByText("Formas de pagamento salvas."),
    ).toBeInTheDocument();
    const saved = await repository.getPaymentMethodSettings(clinicId);
    expect(saved.methods.slice(0, 2)).toEqual(restricted);
  });

  it("limits the plan template and the sale, then shows paid and open installments", async () => {
    const { repository } = await setupApi();
    await repository.updatePaymentMethodSettings(clinicId, actorId, {
      methods: restricted,
    });
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente parcelada",
      phone: "11988887777",
      tags: [],
    });
    const [service] = await repository.listServices(clinicId);
    const template = await repository.createPlanTemplate(clinicId, actorId, {
      name: "Pacote em parcelas",
      kind: "fixed_package",
      totalValueInCents: 60000,
      services: [
        { serviceId: service!.id, totalSessions: 6, totalValueInCents: 60000 },
      ],
    });

    // Configurações › Planos: limite próprio de 3 parcelas.
    const settings = open("/configuracoes?secao=planos");
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Editar plano ${template.name}`,
      }),
    );
    const templateDialog = screen.getByRole("dialog", {
      name: "Editar plano do catálogo",
    });
    expect(
      within(templateDialog).getByLabelText("Aceita parcelamento"),
    ).toBeChecked();
    change("Até quantas parcelas", "3", templateDialog);
    await save("Editar plano do catálogo", "Salvar plano");
    expect(
      (await repository.listPlanTemplates(clinicId)).find(
        (item) => item.id === template.id,
      )?.maxInstallments,
    ).toBe(3);
    settings.unmount();

    const sale = open(`/planos?patientId=${patient.id}`);
    fireEvent.click(await screen.findByRole("button", { name: "Novo plano" }));
    const dialog = screen.getByRole("dialog", { name: "Novo plano" });
    await within(dialog).findByRole("option", {
      name: new RegExp(template.name),
    });
    change("Plano cadastrado", template.id, dialog);
    // O plano começa no Pix (nunca sem forma); no cartão o limite é o do plano.
    expect(within(dialog).getByLabelText("Forma de pagamento")).toHaveValue(
      "pix",
    );
    change("Forma de pagamento", "card", dialog);
    change("Parcelas", "5", dialog);
    // O plano aceita até 3: a quantidade acompanha o limite e a dica explica.
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Parcelas")).toHaveValue(3),
    );
    expect(within(dialog).getByText("Este plano: até 3x.")).toBeInTheDocument();
    change("Forma de pagamento", "pix", dialog);
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Parcelas")).toHaveValue(1),
    );
    expect(within(dialog).getByText("Pix: só à vista.")).toBeInTheDocument();
    change("Forma de pagamento", "card", dialog);
    change("Parcelas", "3", dialog);
    await save("Novo plano", "Criar plano e parcelas");
    const plan = (await repository.listPatientPlans(clinicId, patient.id))[0]!;
    expect(plan).toMatchObject({ paymentMethod: "card", installments: 3 });

    expect(await screen.findByText("Cartão · 3 parcelas")).toBeInTheDocument();
    const [first] = (await repository.getFinancialSummary(clinicId)).receivables
      .filter((item) => item.planId === plan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);
    await repository.settleReceivable(clinicId, actorId, first!.id, "card");
    sale.unmount();
    open(`/planos?patientId=${patient.id}`);
    expect(
      await screen.findByText("1 de 3 pagas · R$ 400,00 em aberto"),
    ).toBeInTheDocument();
  });

  it("settles a plan installment with the sale method, plan total and paid installments", async () => {
    const { repository } = await setupApi();
    await repository.updatePaymentMethodSettings(clinicId, actorId, {
      methods: restricted,
    });
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente do cartão",
      phone: "11988887777",
      tags: [],
    });
    const [service] = await repository.listServices(clinicId);
    const template = await repository.createPlanTemplate(clinicId, actorId, {
      name: "Pacote do cartão",
      kind: "fixed_package",
      totalValueInCents: 30000,
      services: [
        { serviceId: service!.id, totalSessions: 3, totalValueInCents: 30000 },
      ],
    });
    const plan = await repository.createPatientPlan(clinicId, actorId, {
      planTemplateId: template.id,
      patientId: patient.id,
      name: template.name,
      kind: "fixed_package",
      services: template.services,
      validFrom: "2040-06-01",
      totalValueInCents: 30000,
      installments: 3,
      firstDueDate: "2040-06-10",
      paymentMethod: "card",
    });
    const [first] = (
      await repository.getFinancialSummary(clinicId)
    ).receivables.filter(
      (item) => item.planId === plan.id && item.installmentNumber === 1,
    );
    await repository.settleReceivable(clinicId, actorId, first!.id, "card");
    open("/financeiro");
    // Cada parcela aparece no mês do próprio vencimento.
    const description = await screen.findByText("Pacote do cartão · 2/3");
    const row = description.closest<HTMLElement>(".finance-row")!;
    expect(within(row).getByText("Parcela 2 de 3")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Dar baixa" }));
    const dialog = screen.getByRole("dialog", { name: "Dar baixa na parcela" });
    const summary = within(dialog)
      .getByText("Valor total do plano")
      .closest("dl")!;
    expect(summary).toHaveTextContent("Valor total do planoR$ 300,00");
    expect(summary).toHaveTextContent("Valor da parcelaR$ 100,00");
    expect(summary).toHaveTextContent("Parcelas pagas1 de 3");
    // A forma combinada na venda já vem marcada.
    expect(
      within(dialog).getByLabelText<HTMLSelectElement>(
        "Forma de pagamento recebida",
      ).value,
    ).toBe("card");
    // Parcela de um parcelamento não se parcela de novo na forma.
    expect(
      within(dialog).queryByLabelText("Parcelamento (Cartão)"),
    ).not.toBeInTheDocument();
    await save("Dar baixa na parcela", "Confirmar baixa");
    await waitFor(async () =>
      expect(
        (await repository.getFinancialSummary(clinicId)).receivables.find(
          (item) => item.description === "Pacote do cartão · 2/3",
        ),
      ).toMatchObject({ status: "paid", paymentMethod: "card" }),
    );
    expect(
      await screen.findByText("Parcela 2 de 3 · Pago: Cartão"),
    ).toBeInTheDocument();
  });

  it("keeps the balance of a partial payment as the same installment", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente do saldo",
      phone: "11988887777",
      tags: [],
    });
    const [service] = await repository.listServices(clinicId);
    const template = await repository.createPlanTemplate(clinicId, actorId, {
      name: "Pilates trimestral QA",
      kind: "fixed_package",
      totalValueInCents: 120000,
      services: [
        { serviceId: service!.id, totalSessions: 3, totalValueInCents: 120000 },
      ],
    });
    const plan = await repository.createPatientPlan(clinicId, actorId, {
      planTemplateId: template.id,
      patientId: patient.id,
      name: template.name,
      kind: "fixed_package",
      services: template.services,
      validFrom: "2040-06-01",
      totalValueInCents: 120000,
      installments: 3,
      firstDueDate: "2040-06-10",
      paymentMethod: "card",
    });
    const [first] = (
      await repository.getFinancialSummary(clinicId)
    ).receivables.filter(
      (item) => item.planId === plan.id && item.installmentNumber === 1,
    );
    // Parcela de R$ 400 com R$ 350 recebidos: R$ 50 viram saldo da parcela 1.
    await repository.settleReceivable(
      clinicId,
      actorId,
      first!.id,
      "card",
      undefined,
      { receivedInCents: 35000 },
    );
    open("/financeiro");
    const description = await screen.findByText(
      "Pilates trimestral QA · 1/3 · saldo",
    );
    const row = description.closest<HTMLElement>(".finance-row")!;
    expect(within(row).getByText("Parcela 1 de 3 · saldo")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "Dar baixa" }));
    const dialog = screen.getByRole("dialog", { name: "Dar baixa na parcela" });
    const summary = within(dialog)
      .getByText("Valor total do plano")
      .closest("dl")!;
    // A parcela 1 só conta como paga quando o saldo também for pago.
    expect(summary).toHaveTextContent("Parcelas pagas0 de 3");
  });

  it("splits a single charge on the card when settling it", async () => {
    const { repository } = await setupApi();
    await repository.updatePaymentMethodSettings(clinicId, actorId, {
      methods: restricted,
    });
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente à vista",
      phone: "11988887776",
      tags: [],
    });
    const [service] = await repository.listServices(clinicId);
    const template = await repository.createPlanTemplate(clinicId, actorId, {
      name: "Pacote à vista",
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
    });
    open("/financeiro");
    const description = await screen.findByText("Pacote à vista · 1/1");
    const row = description.closest<HTMLElement>(".finance-row")!;
    fireEvent.click(within(row).getByRole("button", { name: "Dar baixa" }));
    const dialog = screen.getByRole("dialog", { name: "Dar baixa na parcela" });
    // Pix só à vista: sem escolha de parcelas.
    expect(
      within(dialog).queryByLabelText("Parcelamento (Pix)"),
    ).not.toBeInTheDocument();
    change("Forma de pagamento recebida", "card", dialog);
    const options = within(
      await within(dialog).findByLabelText("Parcelamento (Cartão)"),
    ).getAllByRole("option");
    expect(options.map((item) => item.textContent)).toEqual([
      "À vista",
      "2x",
      "3x",
      "4x",
      "5x",
      "6x",
    ]);
    change("Parcelamento (Cartão)", "3", dialog);
    await save("Dar baixa na parcela", "Confirmar baixa");
    await waitFor(async () =>
      expect(
        (await repository.getFinancialSummary(clinicId)).receivables.find(
          (item) => item.description === "Pacote à vista · 1/1",
        ),
      ).toMatchObject({
        status: "paid",
        paymentMethod: "card",
        paymentInstallments: 3,
      }),
    );
  });
});
