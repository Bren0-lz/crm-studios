import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clinicId, setupApi } from "../../test-support/api-server";
import {
  change,
  chooseService,
  open,
  save,
} from "../../test-support/workflow-ui";

describe("seções de Configurações recarregam ao voltar a elas (RE11)", () => {
  it("o plano usa o serviço criado em Serviços e salas, sem recarregar a página", async () => {
    const { repository } = await setupApi();
    open("/configuracoes?secao=planos");
    const plans = await screen.findByRole("tabpanel", { name: "Planos" });
    await within(plans).findByRole("button", { name: "Cadastrar plano" });

    fireEvent.click(screen.getByRole("tab", { name: "Serviços e salas" }));
    const registry = screen.getByRole("tabpanel", { name: "Serviços e salas" });
    fireEvent.click(
      await within(registry).findByRole("button", { name: "Novo cadastro" }),
    );
    change(
      "Nome",
      "Reformer em dupla",
      screen.getByRole("dialog", { name: "Novo cadastro" }),
    );
    await save("Novo cadastro", "Salvar cadastro");
    const service = (await repository.listServices(clinicId)).find(
      (item) => item.name === "Reformer em dupla",
    )!;
    expect(service).toBeDefined();

    const plansTab = screen.getByRole("tab", { name: "Planos" });
    await waitFor(() => expect(plansTab).toBeEnabled());
    fireEvent.click(plansTab);
    fireEvent.click(
      await within(screen.getByRole("tabpanel", { name: "Planos" })).findByRole(
        "button",
        { name: "Cadastrar plano" },
      ),
    );
    const plan = screen.getByRole("dialog", { name: "Cadastrar plano" });
    change("Nome do plano", "Dupla mensal", plan);
    change("Tipo de plano", "single", plan);
    change("Valor total", "120,00", plan);
    chooseService(plan, "Serviço 1", "Reformer em dupla");
    await save("Cadastrar plano", "Salvar plano");

    const [template] = (await repository.listPlanTemplates(clinicId)).filter(
      (item) => item.name === "Dupla mensal",
    );
    expect(template?.services).toEqual([
      expect.objectContaining({ serviceId: service.id }),
    ]);
    // A linha do plano mostra o nome do serviço (antes ficava "Serviço" até o F5).
    const row = (
      await within(screen.getByRole("tabpanel", { name: "Planos" })).findByText(
        "Dupla mensal",
      )
    ).closest("article")!;
    await waitFor(() =>
      expect(row).toHaveTextContent("Reformer em dupla: 1 sessão"),
    );
  });
});
