import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open, change, expand, save } from "../../test-support/workflow-ui";

describe("finance workflows through real HTTP handlers", () => {
  it("classifies a supplier expense, combines filters and settles with independent payment and cash dates", async () => {
    const { repository } = await setupApi();
    const supplier = await repository.saveSupplier(clinicId, actorId, {
      name: "Fornecedor de materiais",
      kind: "company",
      document: "",
      phone: "",
      notes: "",
      active: true,
    });
    const category = await repository.createFinancialCategory(clinicId, {
      name: "Materiais",
      kind: "expense",
    });
    const center = await repository.createCostCenter(clinicId, {
      name: "Operação",
    });
    open("/financeiro");
    fireEvent.click(
      await screen.findByRole("button", { name: "Nova despesa" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Nova conta a pagar" });
    await within(dialog).findByRole("option", { name: supplier!.name });
    for (const [label, value] of [
      ["Descrição", "Compra de faixas"],
      ["Fornecedor cadastrado", supplier!.id],
      ["Lançamento", "2040-06-01"],
      ["Competência", "2040-06"],
      ["Vencimento", "2040-06-10"],
      ["Categoria", category.id],
      ["Centro de custo (opcional)", center.id],
      ["Valor", "75.50"],
      ["Observações", "Material terapêutico"],
    ])
      change(label!, value!, dialog);
    await save("Nova conta a pagar", "Cadastrar despesa");
    fireEvent.click(screen.getByRole("button", { name: /^Contas a pagar \(/ }));
    const filters = expand("Filtrar lançamentos por datas e classificação");
    await within(filters).findByLabelText("Pesquisar lançamento");
    await within(filters).findByRole("option", { name: supplier!.name });
    for (const [label, value] of [
      ["Pesquisar lançamento", "FAIXAS"],
      ["Data considerada", "postedOn"],
      ["De", "2040-06-01"],
      ["Até", "2040-06-30"],
      ["Competência", "2040-06"],
      ["Situação do lançamento", "open"],
      ["Categoria do lançamento", category.id],
      ["Centro de custo do lançamento", center.id],
      ["Fornecedor do lançamento", supplier!.id],
      ["Forma de pagamento do lançamento", "unspecified"],
    ])
      change(label!, value!, filters);
    expect(
      screen.getByText("Compra de faixas", { exact: true }),
    ).toBeInTheDocument();
    change("Data considerada", "paidAt", filters);
    expect(
      screen.queryByText("Compra de faixas", { exact: true }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(filters).getByRole("button", {
        name: "Limpar filtros de lançamentos",
      }),
    );
    const row = screen
      .getByText("Compra de faixas", { exact: true })
      .closest<HTMLElement>(".finance-row")!;
    fireEvent.click(within(row).getByRole("button", { name: /^Pagar / }));
    dialog = screen.getByRole("dialog", { name: "Pagar despesa" });
    change("Forma de pagamento usada", "card", dialog);
    fireEvent.click(
      within(dialog).getByText("Datas do pagamento e do caixa", {
        exact: true,
      }),
    );
    change("Data e hora do pagamento", "2040-06-10T10:00", dialog);
    change("Disponibilidade no caixa", "2040-06-12T08:00", dialog);
    await save("Pagar despesa", "Confirmar pagamento");
    const payable = (
      await repository.getFinancialWorkspace(clinicId)
    ).payables.find((item) => item.description === "Compra de faixas")!;
    expect(payable).toMatchObject({
      status: "paid",
      amountInCents: 7550,
      supplierId: supplier!.id,
      paymentMethod: "card",
      paidAt: new Date("2040-06-10T10:00").toISOString(),
      cashAvailableAt: new Date("2040-06-12T08:00").toISOString(),
    });
    await waitFor(() =>
      expect(
        screen.getByText("Compra de faixas", { exact: true }),
      ).toBeInTheDocument(),
    );
  });
  it("reconciles a paid commission and records a recovery while preserving its original payment", async () => {
    const { repository } = await setupApi();
    const [patient] = await repository.listPatients(clinicId);
    const [professional] = await repository.listProfessionals(clinicId);
    const [room] = await repository.listRooms(clinicId);
    const [service] = await repository.listServices(clinicId);
    await repository.createCommissionRule(clinicId, {
      professionalId: professional!.id,
      serviceId: service!.id,
      kind: "fixed",
      percentage: 0,
      fixedAmountInCents: 1500,
      effectiveFrom: "2039-01-01",
    });
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patient!.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: "2039-02-10T12:00:00Z",
      visitType: "trial",
    });
    // Realizado só depois do início do atendimento (QC3): relógio no dia seguinte.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-02-11T12:00:00Z"));
    try {
      await repository.updateAppointmentStatus(
        clinicId,
        appointment.id,
        "completed",
      );
    } finally {
      vi.useRealTimers();
    }
    const commission = (
      await repository.generateCommissions(clinicId, "2039-02")
    ).find((item) => item.appointmentId === appointment.id)!;
    await repository.settleCommission(clinicId, actorId, commission.id);
    const original = structuredClone(
      (await repository.getFinancialWorkspace(clinicId)).commissions.find(
        (item) => item.id === commission.id,
      ),
    );
    await repository.updateAppointmentStatus(
      clinicId,
      appointment.id,
      "confirmed",
    );
    open("/financeiro");
    fireEvent.click(
      await screen.findByRole("button", { name: /^Comissões \(/ }),
    );
    vi.spyOn(api, "commissionReconciliation").mockRejectedValueOnce(
      new Error("Falha temporária ao carregar a comissão."),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Conciliar comissão de ${professional!.fullName}`,
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Conciliar comissão",
    });
    await within(dialog).findByText("Falha temporária ao carregar a comissão.");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Atualizar prévia da comissão",
      }),
    );
    await within(dialog).findByText("Pagamento original registrado");
    // Sem motivo, Confirmar fica desativado dizendo o que falta (QM14).
    const reconcile = within(dialog).getByRole("button", {
      name: "Confirmar conciliação",
    });
    expect(reconcile).toBeDisabled();
    expect(reconcile).toHaveAccessibleDescription(
      "Falta: Motivo da conciliação (pelo menos 5 caracteres).",
    );
    change(
      "Motivo da conciliação",
      "Correção da presença registrada pela equipe",
      dialog,
    );
    expect(reconcile).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar conciliação" }),
    );
    await within(dialog).findByText(
      "Conciliação registrada com ajustes separados da comissão original.",
    );
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Registrar devolução ao caixa",
      }),
    );
    await save("Confirmar baixa conciliada", "Confirmar registro conciliado");
    await within(dialog).findByText("Baixa conciliada registrada.");
    const workspace = await repository.getFinancialWorkspace(clinicId);
    expect(
      workspace.commissions.find((item) => item.id === commission.id),
    ).toEqual(original);
    expect(workspace.commissionAdjustments).toMatchObject([
      { commissionId: commission.id, amountInCents: -1500, status: "paid" },
    ]);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Estornar baixa conciliada" }),
    );
    await save("Estornar baixa conciliada", "Confirmar registro conciliado");
    await within(dialog).findByText(
      "Estorno conciliado registrado sem remover o pagamento original.",
    );
    expect(within(dialog).getByText(/Estornado/)).toBeInTheDocument();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-02-11T12:00:00Z"));
    try {
      await repository.updateAppointmentStatus(
        clinicId,
        appointment.id,
        "completed",
      );
    } finally {
      vi.useRealTimers();
    }
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Atualizar conta conciliada",
      }),
    );
    await within(dialog).findByLabelText("Motivo da conciliação");
    change(
      "Motivo da conciliação",
      "Presença restaurada após conferência",
      dialog,
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar conciliação" }),
    );
    const compensate = await within(dialog).findByRole("button", {
      name: "Compensar saldo zero",
    });
    fireEvent.click(compensate);
    expect(
      screen.getByRole("dialog", { name: "Confirmar baixa conciliada" }),
    ).toHaveTextContent("O saldo zero não gera movimentação no caixa.");
    await save("Confirmar baixa conciliada", "Confirmar registro conciliado");
    await waitFor(async () => {
      const current = await repository.getFinancialWorkspace(clinicId);
      expect(current.commissionAdjustments).toHaveLength(2);
      expect(
        current.commissionAdjustments?.every((item) => item.status === "paid"),
      ).toBe(true);
      expect(
        current.commissions.find((item) => item.id === commission.id),
      ).toEqual(original);
    });
  });
  it("creates a contextual receivable, reclassifies it and changes dates without losing its value", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      fullName: "Cliente financeiro",
      phone: "11988887777",
      tags: [],
    });
    open(`/financeiro?patientId=${patient.id}`);
    await screen.findByText("Lançamentos e competência", { exact: true });
    const panel = expand("Lançamentos e competência");
    fireEvent.click(
      await within(panel).findByRole("button", {
        name: "Nova conta a receber",
      }),
    );
    let dialog = await screen.findByRole("dialog", {
      name: "Nova conta a receber",
    });
    change("Descrição", "Sessão avulsa negociada", dialog);
    change("Valor (R$)", "125.50", dialog);
    change("Vencimento", "2040-06-10", dialog);
    change("Competência", "2040-06", dialog);
    await save("Nova conta a receber", "Salvar lançamento");
    let entry = (
      await repository.getFinancialSummary(clinicId)
    ).receivables.find((item) => item.patientId === patient.id)!;
    expect(entry).toMatchObject({
      amountInCents: 12550,
      competence: "2040-06",
      dueDate: "2040-06-10",
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Classificar" }));
    dialog = screen.getByRole("dialog", { name: "Classificar lançamento" });
    change("Competência", "2040-07", dialog);
    await save("Classificar lançamento", "Salvar lançamento");
    fireEvent.click(
      within(panel).getByRole("button", { name: "Datas financeiras" }),
    );
    dialog = screen.getByRole("dialog", { name: "Datas financeiras" });
    change("Lançamento", "2040-06-01", dialog);
    change("Vencimento", "2040-07-10", dialog);
    change("Motivo do ajuste", "Correção acordada com o cliente", dialog);
    await save("Datas financeiras", "Salvar datas");
    entry = (await repository.getFinancialSummary(clinicId)).receivables.find(
      (item) => item.id === entry.id,
    )!;
    expect(entry).toMatchObject({
      amountInCents: 12550,
      competence: "2040-07",
      postedOn: "2040-06-01",
      dueDate: "2040-07-10",
    });
  });

  it("registers external proof without changing the linked invoice", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      fullName: "Cliente fiscal",
      phone: "11988887777",
      tags: [],
    });
    const before = await repository.getFinancialSummary(clinicId);
    open(`/financeiro?patientId=${patient.id}`);
    await screen.findByText("Documentos fiscais e operações com parceiros", {
      exact: true,
    });
    const panel = expand("Documentos fiscais e operações com parceiros");
    fireEvent.click(
      await within(panel).findByRole("button", {
        name: "Registrar operação externa",
      }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Registrar operação externa",
    });
    change("Tipo de registro", "partner", dialog);
    // Antes de preencher, o botão diz o que falta (QM14).
    expect(
      within(dialog).getByRole("button", { name: "Salvar registro manual" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Salvar registro manual" }),
    ).toHaveAccessibleDescription(
      "Falta: Emissor ou parceiro (pelo menos 2 caracteres), Referência do documento ou operação, Comprovante.",
    );
    change("Emissor ou parceiro", "Parceiro de atendimento", dialog);
    change("Referência do documento ou operação", "PARCEIRO-123", dialog);
    change(
      "Observações do registro",
      "Conferido no portal do parceiro",
      dialog,
    );
    const proof = new File(
      ["%PDF-1.7\nComprovante externo"],
      "comprovante.pdf",
      { type: "application/pdf" },
    );
    fireEvent.change(within(dialog).getByLabelText("Comprovante"), {
      target: { files: [proof] },
    });
    await within(dialog).findByText("comprovante.pdf");
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    await save("Registrar operação externa", "Salvar registro manual");
    expect(await within(panel).findByText(/PARCEIRO-123/)).toBeInTheDocument();
    expect(
      await repository.listExternalOperations(clinicId, patient.id),
    ).toMatchObject([
      {
        kind: "partner",
        counterpart: "Parceiro de atendimento",
        fileName: proof.name,
        patientId: patient.id,
      },
    ]);
    expect(
      (await repository.getFinancialSummary(clinicId)).receivables,
    ).toEqual(before.receivables);
  });
});
