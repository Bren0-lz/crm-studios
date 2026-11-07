import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

const fill = (scope: HTMLElement, label: string, value: string) =>
  fireEvent.change(within(scope).getByLabelText(label), {
    target: { value },
  });

async function chooseService(scope: HTMLElement, name: string) {
  const field = within(scope).getByRole("combobox", { name: "Serviço 1" });
  fireEvent.focus(field);
  fireEvent.click(await within(scope).findByRole("option", { name }));
}

describe("modelo de plano avulso", () => {
  it("tem uma única sessão de um serviço: sem campo de sessões nem outro serviço", async () => {
    const { repository } = await setupApi();
    const [service] = await repository.listServices(clinicId);
    open("/configuracoes?secao=planos");
    fireEvent.click(
      await screen.findByRole("button", { name: "Cadastrar plano" }),
    );
    const plan = screen.getByRole("dialog", { name: "Cadastrar plano" });
    fill(plan, "Nome do plano", "Avaliação postural");
    fill(plan, "Tipo de plano", "promotional");
    expect(within(plan).getByLabelText("Sessões do serviço 1")).toBeVisible();
    fireEvent.click(
      within(plan).getByRole("button", { name: "Adicionar serviço" }),
    );
    expect(
      within(plan).getByRole("combobox", { name: "Serviço 2" }),
    ).toBeVisible();
    // Avulso: fica só o primeiro serviço, sem campo de sessões.
    fill(plan, "Tipo de plano", "single");
    expect(
      within(plan).queryByRole("combobox", { name: "Serviço 2" }),
    ).not.toBeInTheDocument();
    expect(
      within(plan).queryByLabelText("Sessões do serviço 1"),
    ).not.toBeInTheDocument();
    expect(
      within(plan).queryByRole("button", { name: "Adicionar serviço" }),
    ).not.toBeInTheDocument();
    expect(
      within(plan).getByText(
        "Avulso: uma sessão do serviço, pelo valor total.",
      ),
    ).toBeVisible();
    fill(plan, "Valor total", "150,00");
    await chooseService(plan, service!.name);
    fireEvent.click(within(plan).getByRole("button", { name: "Salvar plano" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Cadastrar plano" }),
      ).not.toBeInTheDocument(),
    );
    const [template] = (await repository.listPlanTemplates(clinicId)).filter(
      (item) => item.name === "Avaliação postural",
    );
    expect(template).toMatchObject({
      planType: "single",
      totalValueInCents: 15000,
      services: [
        { serviceId: service!.id, totalSessions: 1, totalValueInCents: 15000 },
      ],
    });
  });
});
