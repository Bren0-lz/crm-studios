import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

// Moeda formatada usa espaço inseparável; o teste compara com espaço comum.
const text = (element: Element | null) =>
  (element?.textContent ?? "").replace(/\u00a0/g, " ");

describe("preço de tabela no cadastro de plano", () => {
  it("lista cada serviço com o preço de tabela, soma e compara com o valor do plano", async () => {
    const { repository } = await setupApi();
    const pilates = await repository.createService(clinicId, {
      name: "Pilates tabela",
      durationMinutes: 50,
      priceInCents: 9000,
      color: "#547A6B",
    });
    const danca = await repository.createService(clinicId, {
      name: "Dança tabela",
      durationMinutes: 60,
      priceInCents: 7000,
      color: "#336699",
    });
    const semPreco = await repository.createService(clinicId, {
      name: "Avaliação tabela",
      durationMinutes: 30,
      priceInCents: 0,
      color: "#996633",
    });
    open("/configuracoes?secao=planos");
    fireEvent.click(
      await screen.findByRole("button", { name: "Cadastrar plano" }),
    );
    const plan = screen.getByRole("dialog", { name: "Cadastrar plano" });
    const fill = (label: string, value: string) =>
      fireEvent.change(within(plan).getByLabelText(label), {
        target: { value },
      });
    expect(
      within(plan).queryByRole("region", {
        name: "Preço de tabela dos serviços",
      }),
    ).not.toBeInTheDocument();

    fill("Nome do plano", "Pacote tabela");
    fill("Tipo de plano", "single");
    fill("Serviço 1", pilates.id);
    fill("Sessões do serviço 1", "8");
    fireEvent.click(
      within(plan).getByRole("button", { name: "Adicionar serviço" }),
    );
    fill("Serviço 2", danca.id);
    fill("Sessões do serviço 2", "4");
    fill("Valor total", "850,00");

    const summary = within(plan).getByRole("region", {
      name: "Preço de tabela dos serviços",
    });
    const lines = within(summary).getAllByRole("listitem");
    expect(lines.map(text)).toEqual([
      "Pilates tabela8 sessões × R$ 90,00R$ 720,00",
      "Dança tabela4 sessões × R$ 70,00R$ 280,00",
    ]);
    const row = (term: string) =>
      text(within(summary).getByText(term).closest("div"));
    expect(row("Total avulso")).toBe("Total avulsoR$ 1.000,00");
    expect(row("Valor do plano")).toBe("Valor do planoR$ 850,00");
    expect(row("Desconto para o cliente")).toBe(
      "Desconto para o clienteR$ 150,00 (15%)",
    );

    // Só referência: o valor do plano não muda com o resumo.
    expect(within(plan).getByLabelText("Valor total")).toHaveValue("850,00");

    fill("Valor total", "1.100,00");
    expect(row("Acréscimo sobre o avulso")).toBe(
      "Acréscimo sobre o avulsoR$ 100,00 (10%)",
    );

    fireEvent.click(
      within(plan).getByRole("button", { name: "Adicionar serviço" }),
    );
    fill("Serviço 3", semPreco.id);
    expect(text(within(summary).getAllByRole("listitem")[2]!)).toContain(
      "sem preço de tabela",
    );
    expect(
      within(summary).getByText(
        "1 serviço sem preço de tabela: o total está incompleto.",
      ),
    ).toBeInTheDocument();
    expect(row("Total avulso")).toBe("Total avulsoR$ 1.000,00");
  });

  it("no plano recorrente usa as sessões do período", async () => {
    const { repository } = await setupApi();
    const pilates = await repository.createService(clinicId, {
      name: "Pilates mensal",
      durationMinutes: 50,
      priceInCents: 9000,
      color: "#547A6B",
    });
    open("/configuracoes?secao=planos");
    fireEvent.click(
      await screen.findByRole("button", { name: "Cadastrar plano" }),
    );
    const plan = screen.getByRole("dialog", { name: "Cadastrar plano" });
    fireEvent.change(within(plan).getByLabelText("Tipo de plano"), {
      target: { value: "monthly" },
    });
    fireEvent.change(within(plan).getByLabelText("Serviço 1"), {
      target: { value: pilates.id },
    });
    fireEvent.change(
      within(plan).getByLabelText("Sessões por semana do serviço 1"),
      { target: { value: "2" } },
    );
    const summary = within(plan).getByRole("region", {
      name: "Preço de tabela dos serviços",
    });
    expect(text(within(summary).getByRole("listitem"))).toBe(
      "Pilates mensal8 sessões × R$ 90,00R$ 720,00",
    );
  });
});
