import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { findMoreAction } from "../../test-support/patient-actions";
import { open, change, expand, save } from "../../test-support/workflow-ui";

describe("client management through real HTTP handlers", () => {
  it("resolves conflicting fields before merging two client histories", async () => {
    const { repository } = await setupApi();
    const source = await repository.createPatient(clinicId, {
      fullName: "Cadastro duplicado de teste",
      phone: "11988887777",
      tags: [],
    });
    const target = await repository.createPatient(clinicId, {
      fullName: "Cadastro principal de teste",
      phone: "11999998888",
      tags: [],
    });
    open("/clientes");
    await findMoreAction("Mesclar clientes");
    const dialog = screen.getByRole("dialog", { name: "Mesclar clientes" });
    for (const [label, patient] of [
      ["Cadastro duplicado", source],
      ["Cadastro principal", target],
    ] as const) {
      fireEvent.focus(
        within(dialog).getByRole("combobox", { name: new RegExp(`^${label}`) }),
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
    for (const select of within(dialog).getAllByRole("combobox"))
      fireEvent.change(select, { target: { value: "target" } });
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
    const panel = expand("Estoque e comandas");
    await within(panel).findByText("Comandas", { exact: true });
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
    change("Atendimento", appointment.id, dialog);
    fireEvent.submit(
      within(dialog)
        .getAllByRole("button", { name: "Vincular atendimento" })
        .at(-1)!
        .closest("form")!,
    );
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
  it("creates a product, reserves stock, settles a tab and requires reversal before cancellation", async () => {
    const { repository } = await setupApi();
    const patient = await repository.createPatient(clinicId, {
      fullName: "Cliente de produtos",
      phone: "11988887777",
      tags: [],
    });
    const category = await repository.saveClinicCatalog(
      clinicId,
      actorId,
      "product_category",
      { name: "Terapia", active: true },
    );
    const brand = await repository.saveClinicCatalog(
      clinicId,
      actorId,
      "product_brand",
      { name: "Marca clínica", active: true },
    );
    open(`/clientes/${patient.id}`);
    await screen.findByRole("heading", { name: patient.fullName });
    fireEvent.click(await screen.findByRole("tab", { name: "Comandas" }));
    const panel = expand("Estoque e comandas");
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Novo produto" }),
    );
    let dialog = screen.getByRole("dialog", { name: "Novo produto" });
    change("Nome", "Faixa terapêutica", dialog);
    change("Código do produto", "FAIXA", dialog);
    change("Custo (R$)", "10", dialog);
    change("Preço de venda (R$)", "20", dialog);
    change("Estoque inicial", "10", dialog);
    change("Estoque mínimo", "2", dialog);
    change("Categoria", category!.id, dialog);
    change("Marca", brand!.id, dialog);
    await save("Novo produto", "Salvar produto");
    const product = (
      await repository.getInventoryWorkspace(clinicId)
    ).products.find((item) => item.sku === "FAIXA")!;
    expect(product.salePriceInCents).toBe(2000);
    fireEvent.click(
      within(panel).getByRole("button", { name: "Movimentar estoque" }),
    );
    dialog = screen.getByRole("dialog", { name: "Movimentar estoque" });
    change("Produto", product.id, dialog);
    change("Quantidade", "2", dialog);
    change("Motivo", "Compra de reposição", dialog);
    await save("Movimentar estoque", "Registrar movimento");
    fireEvent.click(
      within(panel).getByRole("button", { name: "Abrir comanda" }),
    );
    await save("Abrir comanda", "Abrir comanda");
    dialog = await screen.findByRole("dialog", {
      name: `Comanda · ${patient.fullName}`,
    });
    change("Produto", product.id, dialog);
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
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar cancelamento" }),
    );
    await within(dialog).findByText(/estorno/i);
    await repository.reverseReceivablePayment(
      clinicId,
      actorId,
      tab.receivableId!,
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar cancelamento" }),
    );
    await within(dialog).findByText("Comanda cancelada; estoque restituído.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    const productRowAfterCancellation = within(panel)
      .getByText("Faixa terapêutica", { exact: true })
      .closest<HTMLElement>(".table-row")!;
    fireEvent.click(
      within(productRowAfterCancellation).getByRole("button", {
        name: "Editar",
      }),
    );
    dialog = screen.getByRole("dialog", { name: "Editar produto" });
    change("Unidade", "kit", dialog);
    change("Categoria", "", dialog);
    change("Marca", "", dialog);
    fireEvent.click(within(dialog).getByLabelText("Ativo"));
    await save("Editar produto", "Salvar produto");
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      ),
    ).toMatchObject({ unit: "kit", active: false, currentStock: 12 });
    expect(within(panel).getByText(/inativo/)).toBeInTheDocument();
    expect(
      (await repository.getInventoryWorkspace(clinicId)).products.find(
        (item) => item.id === product.id,
      )?.currentStock,
    ).toBe(12);
  });
});
