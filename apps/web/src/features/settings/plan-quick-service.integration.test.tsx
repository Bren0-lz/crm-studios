import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

describe("serviço cadastrado pelo plano", () => {
  it("cadastra o serviço (sem preço) sem sair do plano e já o escolhe na linha", async () => {
    const { repository } = await setupApi();
    open("/configuracoes?secao=planos");
    fireEvent.click(
      await screen.findByRole("button", { name: "Cadastrar plano" }),
    );
    const plan = screen.getByRole("dialog", { name: "Cadastrar plano" });
    const fill = (scope: HTMLElement, label: string, value: string) =>
      fireEvent.change(within(scope).getByLabelText(label), {
        target: { value },
      });
    fill(plan, "Nome do plano", "Reformer avulso");
    fill(plan, "Tipo de plano", "single");
    fill(plan, "Valor total", "90,00");
    // "+ Novo serviço" é uma opção do próprio campo Serviço, não um botão solto no modal.
    expect(
      within(plan).queryByRole("button", { name: /Novo serviço/ }),
    ).not.toBeInTheDocument();
    fill(plan, "Serviço 1", "__create__");

    const quick = screen.getByRole("dialog", { name: "Novo serviço" });
    fill(quick, "Nome do serviço", "Reformer");
    fill(quick, "Duração (minutos)", "50");
    expect(
      within(quick).queryByLabelText(/Preço de tabela/),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(quick).getByRole("button", { name: "Cadastrar serviço" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Novo serviço" }),
      ).not.toBeInTheDocument(),
    );

    const created = (await repository.listServices(clinicId)).find(
      (item) => item.name === "Reformer",
    )!;
    expect(created).toMatchObject({ durationMinutes: 50 });
    expect(within(plan).getByLabelText("Serviço 1")).toHaveValue(created.id);
    // Serviço não gera plano avulso sozinho: o valor é o do plano que está sendo cadastrado.
    expect(
      (await repository.listPlanTemplates(clinicId)).filter(
        (item) => item.name === "Reformer (avulso)",
      ),
    ).toHaveLength(0);

    fireEvent.click(within(plan).getByRole("button", { name: "Salvar plano" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Cadastrar plano" }),
      ).not.toBeInTheDocument(),
    );
    const [template] = (await repository.listPlanTemplates(clinicId)).filter(
      (item) => item.name === "Reformer avulso",
    );
    expect(template).toMatchObject({
      planType: "single",
      totalValueInCents: 9000,
      services: [
        { serviceId: created.id, totalSessions: 1, totalValueInCents: 9000 },
      ],
    });
  });
});
