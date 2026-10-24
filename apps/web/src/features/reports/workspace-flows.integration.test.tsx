import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  actorId,
  captureDownloads,
  clinicId,
  setupApi,
} from "../../test-support/api-server";
import { open, change } from "../../test-support/workflow-ui";

describe("client reports through real HTTP handlers", () => {
  it("filters a client report, selects export columns and downloads a CSV", async () => {
    const { repository } = await setupApi();
    await repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName: "Cliente do relatório",
      phone: "11988887777",
      tags: [],
      city: "São Paulo",
      neighborhood: "Centro",
      occupation: "Professora",
      source: "Indicação",
      level: "Inicial",
      gender: "female",
      interests: ["Postura"],
    });
    const downloads = captureDownloads();
    open("/relatorios");
    await screen.findByRole("heading", { name: "Relatórios gerenciais" });
    fireEvent.click(await screen.findByRole("tab", { name: "Clientes" }));
    fireEvent.click(
      await screen.findByRole("tab", { name: "Consulta de clientes" }),
    );
    const panel = (
      await screen.findByRole("heading", {
        name: "Clientes, frequência, aparelhos e produtos",
      })
    ).closest("section")!;
    fireEvent.click(within(panel).getByText("Filtros avançados"));
    await within(panel).findByRole("link", { name: "Cliente do relatório" });
    for (const [label, value] of [
      ["Cidade", "São Paulo"],
      ["Bairro", "Centro"],
      ["Profissão", "Professora"],
      ["Origem", "Indicação"],
      ["Nível", "Inicial"],
      ["Interesse", "Postura"],
      ["Gênero", "female"],
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
    const columnPicker = within(panel)
      .getByText("Selecionar colunas")
      .closest("details")!;
    fireEvent.click(within(panel).getByText("Selecionar colunas"));
    fireEvent.click(
      within(columnPicker).getByRole("checkbox", { name: "Cidade" }),
    );
    fireEvent.click(exportButton);
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]!.type).toContain("text/csv");
    const exportCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) =>
        String(input).includes("/reports/clients/details/export?"),
      );
    expect(
      new URL(String(exportCall?.[0]), "http://localhost").searchParams
        .get("columns")
        ?.split(","),
    ).not.toContain("city");
    let printedHead = "";
    vi.spyOn(window, "print").mockImplementation(() => {
      printedHead =
        document.querySelector(".clinical-print-sheet thead")?.textContent ??
        "";
    });
    const printButton = within(panel).getByRole("button", {
      name: "Imprimir clientes",
    });
    await waitFor(() => expect(printButton).toBeEnabled());
    fireEvent.click(printButton);
    await waitFor(() => expect(window.print).toHaveBeenCalled());
    expect(printedHead).toContain("Cliente");
    expect(printedHead).not.toContain("Cidade");
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
    change("De", "2040-06-01");
    change("Até", "2040-06-30");
    fireEvent.click(screen.getByRole("button", { name: "Atualizar" }));
    fireEvent.click(await screen.findByRole("tab", { name: "DRE" }));
    const panel = (
      await screen.findByRole("heading", { name: "DRE por competência" })
    ).closest("section")!;
    await within(panel).findByText(
      "DRE por competência · 01/06/2040 a 30/06/2040",
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
