import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

async function seed() {
  const api = await setupApi();
  const patient = (fullName: string) =>
    api.repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName,
      phone: "11988887777",
      tags: [],
    });
  const ana = await patient("Ana Fila");
  const bruno = await patient("Bruno Fila");
  const carla = await patient("Carla Fila");
  const [pilates] = await api.repository.listServices(clinicId);
  const product = await api.repository.createProduct(clinicId, actorId, {
    name: "Faixa elástica",
    sku: "FAIXA-ESPERA",
    unit: "un",
    costInCents: 500,
    salePriceInCents: 1000,
    initialStock: 0,
    minimumStock: 1,
  });
  return { ...api, ana, bruno, carla, pilates: pilates!, product };
}

describe("página Lista de espera", () => {
  it("adiciona um cliente pela página e mostra a procura do item", async () => {
    const { ana, pilates } = await seed();
    open("/lista-de-espera");
    const overview = await screen.findByRole("region", {
      name: "Maior procura",
    });
    expect(
      within(overview).getByText("Ninguém na lista de espera"),
    ).toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole("button", { name: "Adicionar à lista" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Adicionar à lista de espera",
    });
    const submit = within(dialog).getByRole("button", {
      name: "Adicionar à lista",
    });
    expect(submit).toHaveAccessibleDescription("Falta: Cliente, Serviço.");
    fireEvent.change(
      within(dialog).getByRole("combobox", { name: "Cliente" }),
      {
        target: { value: "Ana" },
      },
    );
    fireEvent.click(await screen.findByRole("option", { name: ana.fullName }));
    // Trocar o tipo troca a lista e limpa a escolha.
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reposição de produto" }),
    );
    expect(within(dialog).getByLabelText("Produto")).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Turma de um serviço" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Serviço"), {
      target: { value: pilates.id },
    });
    fireEvent.change(within(dialog).getByLabelText("Observações"), {
      target: { value: "Prefere manhã" },
    });
    expect(submit).toBeEnabled();
    fireEvent.submit(submit.closest("form")!);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Adicionar à lista de espera" }),
      ).not.toBeInTheDocument(),
    );

    const rows = within(
      await screen.findByRole("region", { name: "Maior procura" }),
    )
      .getAllByRole("row")
      .slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText(pilates.name)).toBeInTheDocument();
    const list = screen.getByRole("region", {
      name: "Clientes na lista de espera",
    });
    expect(within(list).getByText(ana.fullName)).toBeInTheDocument();
    expect(within(list).getByText("Prefere manhã")).toBeInTheDocument();
    expect(within(list).getByText("1º")).toBeInTheDocument();
  });

  it("ordena pela maior fila, filtra pelo item e tira da fila quem foi atendido", async () => {
    const { repository, ana, bruno, carla, pilates, product } = await seed();
    for (const patient of [ana, bruno]) {
      await repository.createWaitlistEntry(clinicId, actorId, {
        patientId: patient.id,
        kind: "service",
        serviceId: pilates.id,
        productId: null,
        notes: "",
      });
      // A posição desempata pelo id (aleatório) quando o createdAt coincide.
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    await repository.createWaitlistEntry(clinicId, actorId, {
      patientId: carla.id,
      kind: "product",
      serviceId: null,
      productId: product.id,
      notes: "",
    });
    open("/lista-de-espera");
    const overview = await screen.findByRole("region", {
      name: "Maior procura",
    });
    const rows = within(overview).getAllByRole("row").slice(1);
    expect(
      rows.map((row) => within(row).getAllByRole("cell")[1]!.textContent),
    ).toEqual(["2", "1"]);
    expect(within(rows[0]!).getByText(pilates.name)).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Faixa elástica")).toBeInTheDocument();

    fireEvent.click(
      within(overview).getByRole("button", {
        name: "Ver fila de Faixa elástica",
      }),
    );
    const list = screen.getByRole("region", {
      name: "Clientes na lista de espera",
    });
    expect(within(list).getAllByRole("row").slice(1)).toHaveLength(1);
    expect(within(list).getByText(carla.fullName)).toBeInTheDocument();
    fireEvent.click(
      within(list).getByRole("button", { name: "Limpar filtros" }),
    );
    expect(within(list).getAllByRole("row").slice(1)).toHaveLength(3);

    fireEvent.click(
      within(list).getByRole("button", {
        name: `Abrir entrada de ${ana.fullName}`,
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: ana.fullName });
    expect(within(dialog).getByText("1º")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Avisar por WhatsApp" }),
    ).toHaveAttribute("href", expect.stringContaining("wa.me/5511988887777"));
    fireEvent.change(within(dialog).getByLabelText("Situação"), {
      target: { value: "served" },
    });
    fireEvent.submit(
      within(dialog).getByRole("button", { name: "Salvar" }).closest("form")!,
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: ana.fullName }),
      ).not.toBeInTheDocument(),
    );
    // Atendido sai da fila: Bruno passa a ser o 1º e a procura de Pilates cai para 1.
    await waitFor(() =>
      expect(within(list).queryByText(ana.fullName)).not.toBeInTheDocument(),
    );
    const brunoRow = within(list).getByText(bruno.fullName).closest("tr")!;
    expect(within(brunoRow).getByText("1º")).toBeInTheDocument();
    fireEvent.change(within(list).getByLabelText("Situação"), {
      target: { value: "served" },
    });
    expect(within(list).getByText(ana.fullName)).toBeInTheDocument();
    expect(
      (await repository.listWaitlist(clinicId)).find(
        (item) => item.patientId === ana.id,
      )?.status,
    ).toBe("served");
  });
});
