import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

async function openTabModal() {
  const { repository } = await setupApi();
  const patient = await repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Cliente da comanda estável",
    phone: "11988887777",
    tags: [],
  });
  const tab = await repository.openPatientTab(clinicId, actorId, {
    patientId: patient.id,
  });
  open(`/clientes/${patient.id}`);
  await screen.findByRole("heading", { name: patient.fullName });
  fireEvent.click(await screen.findByRole("tab", { name: "Comandas" }));
  const panel = screen.getByRole("region", { name: "Comandas do cliente" });
  await within(panel).findByText("Aberta");
  fireEvent.click(
    within(panel).getByRole("button", { name: /^Ver comanda de/ }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: `Comanda · ${patient.fullName}`,
  });
  return { repository, tab, dialog };
}

function footerOf(dialog: HTMLElement) {
  const footer = dialog.querySelector<HTMLElement>(".tab-footer")!;
  expect(footer).not.toBeNull();
  const groups = Array.from(footer.children);
  expect(groups).toHaveLength(2);
  expect(groups[0]).toHaveClass("tab-footer-danger");
  expect(groups[1]).toHaveClass("tab-footer-main");
  return {
    danger: groups[0] as HTMLElement,
    main: groups[1] as HTMLElement,
  };
}

describe("patient tab footer (QM5)", () => {
  it("keeps the destructive action on the left and the main action in the same place between steps", async () => {
    const { dialog } = await openTabModal();
    // A área de avisos existe mesmo vazia: avisos não empurram os botões.
    const messages = dialog.querySelector(".tab-messages");
    expect(messages).not.toBeNull();
    expect(messages).toBeEmptyDOMElement();

    let { danger, main } = footerOf(dialog);
    const cancel = within(danger).getByRole("button", {
      name: "Cancelar comanda",
    });
    expect(cancel).toHaveClass("danger-button");
    expect(main.lastElementChild).toHaveTextContent("Fechar comanda");
    expect(main.lastElementChild).toHaveClass("primary-button");

    fireEvent.click(
      within(main).getByRole("button", { name: "Fechar comanda" }),
    );
    ({ danger, main } = footerOf(dialog));
    expect(main.lastElementChild).toHaveTextContent("Confirmar fechamento");
    expect(main.lastElementChild).toHaveClass("primary-button");
    expect(
      within(danger).getByRole("button", { name: "Cancelar comanda" }),
    ).toBeInTheDocument();

    fireEvent.click(within(main).getByRole("button", { name: "Voltar" }));
    ({ main } = footerOf(dialog));
    expect(main.lastElementChild).toHaveTextContent("Fechar comanda");
    expect(dialog.querySelector(".tab-messages")).not.toBeNull();
  });

  it("asks for confirmation before cancelling and 'Voltar' keeps the tab", async () => {
    const { repository, tab, dialog } = await openTabModal();
    fireEvent.click(
      within(footerOf(dialog).danger).getByRole("button", {
        name: "Cancelar comanda",
      }),
    );
    let confirm = await screen.findByRole("dialog", {
      name: "Cancelar comanda",
    });
    fireEvent.click(within(confirm).getByRole("button", { name: "Voltar" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Cancelar comanda" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      (await repository.getInventoryWorkspace(clinicId)).tabs.find(
        (item) => item.id === tab.id,
      )?.status,
    ).toBe("open");

    fireEvent.click(
      within(footerOf(dialog).danger).getByRole("button", {
        name: "Cancelar comanda",
      }),
    );
    confirm = await screen.findByRole("dialog", { name: "Cancelar comanda" });
    const confirmButton = within(confirm).getByRole("button", {
      name: "Cancelar comanda",
    });
    expect(confirmButton).toHaveClass("danger-button");
    fireEvent.submit(confirmButton.closest("form")!);
    await within(dialog).findByText("Comanda cancelada; estoque restituído.");
    expect(
      screen.queryByRole("dialog", { name: "Cancelar comanda" }),
    ).not.toBeInTheDocument();
    expect(
      (await repository.getInventoryWorkspace(clinicId)).tabs.find(
        (item) => item.id === tab.id,
      )?.status,
    ).toBe("cancelled");
  });

  it("keeps 'Confirmar fechamento' disabled listing what is missing (QM14)", async () => {
    const { dialog } = await openTabModal();
    fireEvent.click(
      within(footerOf(dialog).main).getByRole("button", {
        name: "Fechar comanda",
      }),
    );
    const confirm = within(dialog).getByRole("button", {
      name: "Confirmar fechamento",
    });
    expect(confirm).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    const due = within(dialog).getByLabelText("Vencimento");
    const filled = (due as HTMLInputElement).value;
    fireEvent.change(due, { target: { value: "" } });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleDescription("Falta: Vencimento.");
    fireEvent.change(due, { target: { value: filled } });
    expect(confirm).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
  });
});
