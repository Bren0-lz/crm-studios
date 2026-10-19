import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { api } from "../../api";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open, change } from "../../test-support/workflow-ui";

async function openTabWithProduct(
  repository: Awaited<ReturnType<typeof setupApi>>["repository"],
) {
  const patient = await repository.createPatient(clinicId, {
    fullName: "Renata Figueiredo",
    phone: "11977776666",
    tags: [],
  });
  const product = await repository.createProduct(clinicId, actorId, {
    name: "Faixa terapêutica",
    sku: "FAIXA",
    unit: "un",
    costInCents: 1000,
    salePriceInCents: 2000,
    initialStock: 10,
    minimumStock: 2,
  });
  const tab = await repository.openPatientTab(clinicId, actorId, {
    patientId: patient.id,
  });
  await repository.addPatientTabItem(clinicId, actorId, tab.id, {
    productId: product.id,
    quantity: 2,
  });
  return { patient, tab };
}

describe("dados atualizados sem recarregar após mutações (QC6)", () => {
  it("fechar a comanda atualiza a aba Financeiro da ficha sem remontar a tela", async () => {
    const { repository } = await setupApi();
    const { patient } = await openTabWithProduct(repository);
    open(`/clientes/${patient.id}`);
    await screen.findByRole("heading", { name: patient.fullName });
    const overview = screen.getByRole("region", { name: "Resumo do cliente" });

    fireEvent.click(await screen.findByRole("tab", { name: "Financeiro" }));
    const panel = screen.getByRole("tabpanel");
    await within(panel).findByText("Nenhuma parcela registrada.");

    fireEvent.click(screen.getByRole("tab", { name: "Comandas" }));
    const inventory = screen.getByRole("region", {
      name: "Comandas do cliente",
    });
    await within(inventory).findByText("Aberta");
    fireEvent.click(
      within(inventory)
        .getAllByRole("button", { name: "Abrir comanda" })
        .at(-1)!,
    );
    const dialog = await screen.findByRole("dialog", {
      name: `Comanda · ${patient.fullName}`,
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Fechar comanda" }),
    );
    change("Cobrança", "receivable", dialog);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar fechamento" }),
    );
    await within(dialog).findByText(
      "Comanda fechada com cobrança consolidada.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));

    fireEvent.click(screen.getByRole("tab", { name: "Financeiro" }));
    const refreshed = screen.getByRole("tabpanel");
    expect(await within(refreshed).findByText(/R\$\s*40,00/)).toBeVisible();
    expect(within(refreshed).getByText("Em aberto")).toBeInTheDocument();
    expect(
      within(refreshed).queryByText("Nenhuma parcela registrada."),
    ).not.toBeInTheDocument();
    // A ficha não foi remontada: o mesmo resumo continua na tela.
    expect(screen.getByRole("region", { name: "Resumo do cliente" })).toBe(
      overview,
    );
  });

  it("o contador de contas a receber acompanha a mutação feita fora da tela", async () => {
    const { repository } = await setupApi();
    const { tab } = await openTabWithProduct(repository);
    open("/financeiro");
    const counter = await screen.findByRole("button", {
      name: "Contas a receber (0)",
    });
    await act(async () => {
      await api.closePatientTab(tab.id, {
        settlement: "receivable",
        dueDate: "2026-10-30",
      });
    });
    expect(
      await screen.findByRole("button", { name: "Contas a receber (1)" }),
    ).toBe(counter);
  });
});
