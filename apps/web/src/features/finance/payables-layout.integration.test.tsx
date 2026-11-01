import { saoPauloToday } from "@crm/contracts";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

function shiftDate(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe("contas a pagar", () => {
  it("mostra resumo, grupos por situação, busca e a troca para despesas fixas", async () => {
    const { repository } = await setupApi();
    const today = saoPauloToday();
    const category = await repository.createFinancialCategory(clinicId, {
      name: "Operacional",
      kind: "expense",
    });
    const create = (description: string, dueDate: string, cents: number) =>
      repository.createPayable(clinicId, actorId, {
        description,
        supplier: "",
        categoryId: category.id,
        dueDate,
        amountInCents: cents,
        notes: "",
      });
    await create("Aluguel da sala", shiftDate(today, -3), 4000);
    await create("Seguro anual", shiftDate(today, 30), 2000);
    await create("Internet", shiftDate(today, 3), 1000);
    const light = await create("Conta de luz", shiftDate(today, -1), 500);
    await repository.settlePayable(clinicId, actorId, light.id, "pix");
    const water = await create("Conta de água", "2020-01-05", 300);
    await repository.settlePayable(clinicId, actorId, water.id, "pix", {
      paidAt: "2020-01-10T13:00:00.000Z",
    });

    open("/financeiro?aba=contas-a-pagar");
    const panel = (
      await screen.findByRole("heading", { name: "Contas a pagar" })
    ).closest("section")!;

    // Resumo: atrasado em destaque, próximos 7 dias, tudo em aberto e o pago no mês.
    const summary = await within(panel).findByRole("list", {
      name: "Resumo das contas a pagar",
    });
    const blocks = within(summary).getAllByRole("listitem");
    expect(blocks.map((item) => item.textContent)).toEqual([
      expect.stringMatching(/^Em atraso.*40,00.*1 conta$/),
      expect.stringMatching(/^Vence em 7 dias.*10,00.*1 conta$/),
      expect.stringMatching(/^Total em aberto.*70,00.*3 contas$/),
      expect.stringMatching(/^Pago no mês.*5,00.*1 conta$/),
    ]);
    expect(blocks[0]).toHaveClass("alert");

    // Grupos na ordem em atraso → a vencer → pagas, com subtotal; a paga antiga fica escondida.
    const groups = within(panel).getAllByRole("region");
    expect(
      groups.map((group) => group.querySelector("h3")?.textContent),
    ).toEqual(["Em atraso1", "A vencer2", "Pagas1"]);
    const upcoming = groups[1]!;
    expect(
      within(upcoming).getByText(/30,00/, {
        selector: ".payables-group-total",
      }),
    ).toBeInTheDocument();
    expect(
      [...upcoming.querySelectorAll(".finance-item > strong")].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Internet", "Seguro anual"]);
    expect(within(panel).queryByText("Conta de água")).not.toBeInTheDocument();
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Ver pagas de meses anteriores (1)",
      }),
    );
    expect(
      within(within(panel).getByRole("region", { name: /^Pagas/ })).getByText(
        "Conta de água",
      ),
    ).toBeInTheDocument();

    // Busca rápida por descrição, sem acento e sem diferenciar maiúsculas.
    const search = within(panel).getByRole("searchbox", {
      name: "Buscar conta a pagar",
    });
    fireEvent.change(search, { target: { value: "SEGURO" } });
    expect(
      within(panel)
        .getAllByRole("region")
        .map((group) => group.querySelector("h3")?.textContent),
    ).toEqual(["A vencer1"]);
    fireEvent.change(search, { target: { value: "agua" } });
    expect(within(panel).getByText("Conta de água")).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "nada disso" } });
    expect(
      within(panel).getByText("Nenhuma conta encontrada"),
    ).toBeInTheDocument();

    // Despesas fixas ficam na outra visão do mesmo painel.
    fireEvent.click(
      within(panel).getByRole("button", { name: "Despesas fixas" }),
    );
    expect(
      await within(panel).findByRole("heading", { name: "Despesas fixas" }),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole("list", { name: "Resumo das contas a pagar" }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Despesas fixas" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
