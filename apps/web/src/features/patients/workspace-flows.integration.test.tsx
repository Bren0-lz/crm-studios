import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { findMoreAction } from "../../test-support/patient-actions";
import { open, change, save } from "../../test-support/workflow-ui";

describe("client management through real HTTP handlers", () => {
  it("resolves conflicting fields before merging two client histories", async () => {
    const { repository } = await setupApi();
    const source = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cadastro duplicado de teste",
      phone: "11988887777",
      tags: [],
    });
    const target = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cadastro principal de teste",
      phone: "11999998888",
      tags: [],
    });
    open("/clientes");
    await findMoreAction("Mesclar clientes");
    const dialog = screen.getByRole("dialog", { name: "Mesclar clientes" });
    // Sem os dois cadastros, a prévia diz o que falta (QM14).
    const previewButton = within(dialog).getByRole("button", {
      name: "Visualizar prévia",
    });
    expect(previewButton).toBeDisabled();
    expect(previewButton).toHaveAccessibleDescription(
      "Falta: Cadastro duplicado, Cadastro principal.",
    );
    for (const [label, patient] of [
      ["Cadastro duplicado", source],
      ["Cadastro principal", target],
    ] as const) {
      fireEvent.change(
        within(dialog).getByRole("combobox", { name: new RegExp(`^${label}`) }),
        { target: { value: patient.fullName } },
      );
      fireEvent.click(
        await within(dialog).findByRole("option", { name: patient.fullName }),
      );
    }
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Visualizar prévia" })
        .closest("form")!,
    );
    const confirm = await within(dialog).findByRole("button", {
      name: "Confirmar mesclagem",
    });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleDescription("Falta: Nome, CPF, Telefone.");
    for (const select of within(dialog).getAllByRole("combobox"))
      fireEvent.change(select, { target: { value: "target" } });
    expect(confirm).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    await save("Mesclar clientes", "Confirmar mesclagem");
    expect(
      await screen.findByText(
        "Cadastros mesclados. Os históricos foram preservados.",
      ),
    ).toBeInTheDocument();
    expect(
      (await repository.listPatients(clinicId)).some(
        (item) => item.id === source.id,
      ),
    ).toBe(false);
    expect(
      (await repository.listPatients(clinicId)).find(
        (item) => item.id === target.id,
      ),
    ).toMatchObject({ fullName: target.fullName, phone: target.phone });
  });

  it("previews old registrations before applying bulk inactivation", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2039-01-10T12:00:00Z"));
    const { repository, app } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cadastro antigo de teste",
      phone: "11988887777",
      tags: [],
    });
    vi.setSystemTime(new Date("2040-01-10T12:00:00Z"));
    localStorage.setItem(
      "crm.auth.token",
      app.jwt.sign({ sub: actorId, clinicId, role: "admin" }),
    );
    open("/clientes");
    await findMoreAction("Inativar antigos");
    const dialog = screen.getByRole("dialog", {
      name: "Inativar clientes antigos",
    });
    change("Meses sem atendimentos", "6", dialog);
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Visualizar prévia" })
        .closest("form")!,
    );
    await within(dialog).findByText(new RegExp(patient.fullName));
    await save("Inativar clientes antigos", "Confirmar inativação");
    expect(
      (await repository.listPatients(clinicId)).find(
        (item) => item.id === patient.id,
      )?.status,
    ).toBe("inactive");
  });
});

describe("inventory and tab workflows through real HTTP handlers", () => {
  it("links and removes an existing appointment without deleting it from the agenda", async () => {
    const { repository } = await setupApi();
    const [patient] = await repository.listPatients(clinicId);
    const [professional] = await repository.listProfessionals(clinicId);
    const [room] = await repository.listRooms(clinicId);
    const [service] = await repository.listServices(clinicId);
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patient!.id,
      professionalId: professional!.id,
      roomId: room!.id,
      serviceId: service!.id,
      startsAt: "2040-06-01T12:00:00Z",
      visitType: "regular",
    });
    const tab = await repository.openPatientTab(clinicId, actorId, {
      patientId: patient!.id,
      notes: "Serviço avulso",
    });
    open(`/clientes/${patient!.id}`);
    await screen.findByRole("heading", { name: patient!.fullName });
    fireEvent.click(await screen.findByRole("tab", { name: "Comandas" }));
    const panel = screen.getByRole("region", { name: "Comandas do cliente" });
    await within(panel).findByText("Aberta");
    fireEvent.click(
      within(panel).getAllByRole("button", { name: "Abrir comanda" }).at(-1)!,
    );
    const dialog = await screen.findByRole("dialog", {
      name: `Comanda · ${patient!.fullName}`,
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Vincular atendimento" }),
    );
    change("Até", "2040-06-30", dialog);
    change("De", "2040-06-01", dialog);
    await within(dialog).findByRole("option", {
      name: new RegExp(service!.name),
    });
    // Sem atendimento escolhido, o botão diz o que falta (QM14).
    const link = within(dialog)
      .getAllByRole("button", { name: "Vincular atendimento" })
      .at(-1)!;
    expect(link).toBeDisabled();
    expect(link).toHaveAccessibleDescription("Falta: Atendimento.");
    change("Atendimento", appointment.id, dialog);
    expect(link).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    fireEvent.submit(link.closest("form")!);
    await within(dialog).findByText("Serviço adicionado à comanda.");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).tabs.find(
        (item) => item.id === tab.id,
      )?.services,
    ).toHaveLength(1);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remover serviço" }),
    );
    await within(dialog).findByText(
      "Serviço removido. O atendimento permanece na agenda.",
    );
    expect(
      (await repository.getInventoryWorkspace(clinicId)).tabs.find(
        (item) => item.id === tab.id,
      )?.services,
    ).toHaveLength(0);
    expect(
      (
        await repository.listAppointments(
          clinicId,
          "2040-06-01T00:00:00Z",
          "2040-06-02T00:00:00Z",
        )
      ).some((item) => item.id === appointment.id),
    ).toBe(true);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Fechar comanda" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(
      within(dialog).queryByRole("button", { name: "Confirmar fechamento" }),
    ).not.toBeInTheDocument();
  });
  it("sells a registered product in the client's tab and requires reversal before cancellation", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente de produtos",
      phone: "11988887777",
      tags: [],
    });
    const product = await repository.createProduct(clinicId, actorId, {
      name: "Faixa terapêutica",
      sku: "FAIXA",
      unit: "un",
      costInCents: 1000,
      salePriceInCents: 2000,
      initialStock: 12,
      minimumStock: 2,
    });
    open(`/clientes/${patient.id}`);
    await screen.findByRole("heading", { name: patient.fullName });
    fireEvent.click(await screen.findByRole("tab", { name: "Comandas" }));
    const panel = screen.getByRole("region", { name: "Comandas do cliente" });
    // Produtos e estoque ficam no Financeiro; a ficha só abre comandas (QM9).
    await within(panel).findByText("Nenhuma comanda");
    expect(
      within(panel).queryByRole("button", { name: "Novo produto" }),
    ).not.toBeInTheDocument();
    expect(within(panel).queryByText("Histórico de estoque")).toBeNull();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Abrir comanda" }),
    );
    await save("Abrir comanda", "Abrir comanda");
    const dialog = await screen.findByRole("dialog", {
      name: `Comanda · ${patient.fullName}`,
    });
    // Sem produto, o botão diz o que falta (QM14).
    const addProduct = within(dialog)
      .getAllByRole("button", { name: "Adicionar produto" })
      .at(-1)!;
    expect(addProduct).toBeDisabled();
    expect(addProduct).toHaveAccessibleDescription("Falta: Produto.");
    change("Produto", product.id, dialog);
    expect(addProduct).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    change("Quantidade", "2", dialog);
    fireEvent.click(
      within(dialog)
        .getAllByRole("button", { name: "Adicionar produto" })
        .at(-1)!,
    );
    await within(dialog).findByText("Produto reservado na comanda.");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      )?.currentStock,
    ).toBe(10);
    const productRow = within(dialog)
      .getByText("Faixa terapêutica", { exact: true })
      .closest<HTMLElement>(".table-row")!;
    fireEvent.click(
      within(productRow).getByRole("button", { name: "Ajustar item" }),
    );
    change("Quantidade", "3", dialog);
    change("Preço unitário (R$)", "25", dialog);
    fireEvent.submit(
      within(dialog)
        .getByRole("button", { name: "Salvar item" })
        .closest("form")!,
    );
    await within(dialog).findByText("Item atualizado.");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      )?.currentStock,
    ).toBe(9);
    fireEvent.click(within(dialog).getByRole("button", { name: "Remover" }));
    await waitFor(() =>
      expect(
        within(dialog).queryByText("Faixa terapêutica", { exact: true }),
      ).not.toBeInTheDocument(),
    );
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      )?.currentStock,
    ).toBe(12);
    change("Quantidade", "2", dialog);
    fireEvent.click(
      within(dialog)
        .getAllByRole("button", { name: "Adicionar produto" })
        .at(-1)!,
    );
    await within(dialog).findByText("Produto reservado na comanda.");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Fechar comanda" }),
    );
    change("Cobrança", "paid", dialog);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar fechamento" }),
    );
    await within(dialog).findByText(
      "Comanda fechada com cobrança consolidada.",
    );
    const tab = (await repository.getInventoryWorkspace(clinicId)).tabs.find(
      (item) => item.patientId === patient.id,
    )!;
    expect(tab).toMatchObject({ status: "closed", totalInCents: 4000 });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cancelar comanda" }),
    );
    const confirmCancel = await screen.findByRole("dialog", {
      name: "Cancelar comanda",
    });
    const confirmCancelButton = within(confirmCancel).getByRole("button", {
      name: "Cancelar comanda",
    });
    fireEvent.submit(confirmCancelButton.closest("form")!);
    expect(await within(confirmCancel).findByRole("alert")).toHaveTextContent(
      /estorne o pagamento/i,
    );
    await repository.reverseReceivablePayment(
      clinicId,
      actorId,
      tab.receivableId!,
    );
    fireEvent.submit(confirmCancelButton.closest("form")!);
    await within(dialog).findByText("Comanda cancelada; estoque restituído.");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      )?.currentStock,
    ).toBe(12);
  });
});
