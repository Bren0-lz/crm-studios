import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  actorId,
  captureDownloads,
  clinicId,
  setupApi,
} from "../../test-support/api-server";
import { open, change, expand } from "../../test-support/workflow-ui";

describe("client reports through real HTTP handlers", () => {
  it("filters a client report, selects export columns and downloads a CSV", async () => {
    const { repository } = await setupApi();
    await repository.createPatient(clinicId, {
      fullName: "Cliente do relatório",
      phone: "11988887777",
      tags: [],
      city: "São Paulo",
      neighborhood: "Centro",
      occupation: "Professora",
      source: "Indicação",
      level: "Inicial",
      gender: "female",
      clientType: "fixed",
      interests: ["Postura"],
    });
    const downloads = captureDownloads();
    open("/relatorios");
    await screen.findByRole("heading", { name: "Relatórios gerenciais" });
    const panel = expand("Clientes, frequência, aparelhos e produtos");
    await within(panel).findByRole("link", { name: "Cliente do relatório" });
    for (const [label, value] of [
      ["Cidade", "São Paulo"],
      ["Bairro", "Centro"],
      ["Profissão", "Professora"],
      ["Origem", "Indicação"],
      ["Nível", "Inicial"],
      ["Interesse", "Postura"],
      ["Gênero", "female"],
      ["Tipo de cliente", "fixed"],
      ["Segmento", "no_plan"],
    ])
      change(label!, value!, panel);
    fireEvent.submit(
      within(panel).getByLabelText("Buscar cliente").closest("form")!,
    );
    await within(panel).findByRole("link", { name: "Cliente do relatório" });
    const exportButton = await within(panel).findByRole("button", {
      name: "Exportar clientes",
    });
    await waitFor(() => expect(exportButton).toBeEnabled());
    fireEvent.click(exportButton);
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.type).toContain("text/csv");
    change("Buscar cliente", "Inexistente", panel);
    fireEvent.submit(
      within(panel).getByLabelText("Buscar cliente").closest("form")!,
    );
    expect(
      await within(panel).findByText("Nenhum cliente encontrado", {
        exact: true,
      }),
    ).toBeInTheDocument();
  });

  it("loads the DRE by competence and exports a period with receipts and expenses", async () => {
    const { repository } = await setupApi();
    const [patient] = await repository.listPatients(clinicId);
    await repository.createManualReceivable(clinicId, actorId, {
      patientId: patient!.id,
      description: "Receita de sessão",
      amountInCents: 10000,
      dueDate: "2040-06-01",
      competence: "2040-06",
    });
    const downloads = captureDownloads();
    open("/relatorios");
    await screen.findByRole("heading", { name: "Relatórios gerenciais" });
    const panel = expand("DRE por competência");
    await within(panel).findByLabelText("De");
    change("De", "2040-06-01", panel);
    change("Até", "2040-06-30", panel);
    fireEvent.submit(within(panel).getByLabelText("De").closest("form")!);
    await waitFor(() =>
      expect(within(panel).queryByText("Carregando…")).not.toBeInTheDocument(),
    );
    fireEvent.click(
      await within(panel).findByRole("button", { name: "Exportar DRE" }),
    );
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.size).toBeGreaterThan(0);
    vi.spyOn(window, "print").mockImplementation(() => {});
    fireEvent.click(within(panel).getByRole("button", { name: /Imprimir/ }));
    await waitFor(() => expect(window.print).toHaveBeenCalled());
  });
});
