import type { FinancialWorkspace } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { jsonResponse } from "../../test-support/http";
import "../../test-support/legacy-setup";
import { PayableModal } from "./PayableModal";

const authorization: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};
const categoryId = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";

function mount(onCreated = vi.fn()) {
  const workspace = {
    categories: [],
    costCenters: [],
    commissions: [],
    payables: [],
  } as unknown as FinancialWorkspace;
  render(
    <AuthorizationContext.Provider value={authorization}>
      <PayableModal
        workspace={workspace}
        onClose={() => undefined}
        onCreated={onCreated}
      />
    </AuthorizationContext.Provider>,
  );
  return onCreated;
}

describe("PayableModal without categories", () => {
  it("explains what is missing and creates the category in a stacked modal", async () => {
    const bodies: { url: string; body: unknown }[] = [];
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      if (options?.method === "POST") {
        const body = JSON.parse(String(options.body));
        bodies.push({ url, body });
        if (url.endsWith("/finance/categories"))
          return jsonResponse(
            { id: categoryId, clinicId: "x", active: true, ...body },
            201,
          );
        return jsonResponse({ id: "new-payable" }, 201);
      }
      return jsonResponse([]);
    });
    const onCreated = mount();
    expect(
      screen.getByRole("option", { name: "Nenhuma categoria cadastrada" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cadastrar despesa" }),
    ).toBeDisabled();
    // A lista do que falta é visível e ligada ao botão (QM14).
    expect(
      screen.getByRole("button", { name: "Cadastrar despesa" }),
    ).toHaveAccessibleDescription(
      "Falta: Descrição (pelo menos 3 caracteres), Categoria, Valor.",
    );

    // "+ Nova categoria" abre o cadastro por cima, sem fechar a despesa.
    fireEvent.change(screen.getByLabelText("Categoria"), {
      target: { value: "__create__" },
    });
    const categoryDialog = await screen.findByRole("dialog", {
      name: "Nova categoria de despesa",
    });
    expect(
      screen.getByRole("dialog", { name: "Nova conta a pagar" }),
    ).toBeInTheDocument();
    const save = within(categoryDialog).getByRole("button", { name: "Salvar" });
    expect(save).toBeDisabled();
    fireEvent.change(within(categoryDialog).getByLabelText("Nome"), {
      target: { value: "Limpeza" },
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Nova categoria de despesa" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("option", { name: "Limpeza" })).toBeInTheDocument();
    expect(screen.getByLabelText("Categoria")).toHaveValue(categoryId);

    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Ma" },
    });
    fireEvent.change(screen.getByLabelText("Valor"), {
      target: { value: "45,90" },
    });
    expect(
      screen.getByRole("button", { name: "Cadastrar despesa" }),
    ).toHaveAccessibleDescription(
      "Falta: Descrição (pelo menos 3 caracteres).",
    );
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Material de limpeza" },
    });
    expect(screen.queryByText(/Falta:/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Cadastrar despesa" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Cadastrar despesa" }),
    ).not.toHaveAttribute("aria-describedby");
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar despesa" }));
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalled());
    const payable = bodies.find((item) =>
      item.url.endsWith("/finance/payables"),
    );
    expect(payable?.body).toMatchObject({
      description: "Material de limpeza",
      categoryId,
      amountInCents: 4590,
    });
    expect(payable?.body).not.toHaveProperty("costCenterId");
    expect(bodies[0]).toMatchObject({
      url: expect.stringContaining("/finance/categories"),
      body: { name: "Limpeza", kind: "expense" },
    });
  });
});

describe("PayableModal with existing classifications", () => {
  it("creates a cost center from the option at the end of the list", async () => {
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      if (options?.method === "POST")
        return jsonResponse(
          {
            id: "d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2",
            clinicId: "x",
            active: true,
            ...JSON.parse(String(options.body)),
          },
          201,
        );
      return jsonResponse([]);
    });
    const workspace = {
      categories: [
        { id: categoryId, name: "Aluguel", kind: "expense", active: true },
      ],
      costCenters: [
        {
          id: "e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3",
          name: "Pilates",
          active: true,
        },
      ],
      commissions: [],
      payables: [],
    } as unknown as FinancialWorkspace;
    render(
      <AuthorizationContext.Provider value={authorization}>
        <PayableModal
          workspace={workspace}
          onClose={() => undefined}
          onCreated={() => undefined}
        />
      </AuthorizationContext.Provider>,
    );
    expect(
      screen.getByRole("option", { name: "+ Nova categoria" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Cera" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: /Centro de custo/ }),
      {
        target: { value: "__create__" },
      },
    );
    const centerDialog = await screen.findByRole("dialog", {
      name: "Novo centro de custo",
    });
    // A despesa continua aberta por trás, com o que já foi digitado.
    expect(screen.getByLabelText("Descrição")).toHaveValue("Cera");
    fireEvent.change(within(centerDialog).getByLabelText("Nome"), {
      target: { value: "Depilação" },
    });
    fireEvent.click(
      within(centerDialog).getByRole("button", { name: "Salvar" }),
    );
    expect(
      await screen.findByRole("option", { name: "Depilação" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: /Centro de custo/ }),
    ).toHaveValue("d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2");
    expect(
      screen.queryByRole("dialog", { name: "Novo centro de custo" }),
    ).toBeNull();

    fireEvent.change(screen.getByLabelText("Categoria"), {
      target: { value: "__create__" },
    });
    expect(screen.getByLabelText("Categoria")).toHaveValue(categoryId);
    const categoryDialog = await screen.findByRole("dialog", {
      name: "Nova categoria de despesa",
    });
    fireEvent.click(
      within(categoryDialog).getByRole("button", { name: "Voltar" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Nova categoria de despesa" }),
    ).toBeNull();
    expect(screen.getByLabelText("Categoria")).toHaveValue(categoryId);
  });
});
