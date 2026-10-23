import type { FinancialWorkspace } from "@crm/contracts";
import { fireEvent, render, screen } from "@testing-library/react";
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
  it("explains what is missing and creates the category inline", async () => {
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
    expect(screen.getByText("Nenhuma categoria de despesa.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Cadastrar despesa" }),
    ).toBeDisabled();
    // A lista do que falta é visível e ligada ao botão (QM14).
    expect(
      screen.getByRole("button", { name: "Cadastrar despesa" }),
    ).toHaveAccessibleDescription(
      "Falta: Descrição (pelo menos 3 caracteres), Categoria, Valor.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Criar categoria" }));
    expect(screen.getByRole("button", { name: "Criar" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Criar" }),
    ).toHaveAccessibleDescription("Falta: Nome (pelo menos 2 caracteres).");
    fireEvent.change(screen.getByLabelText("Criar categoria"), {
      target: { value: "Limpeza" },
    });
    expect(screen.getByRole("button", { name: "Criar" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Criar" }),
    ).not.toHaveAttribute("aria-describedby");
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    expect(
      await screen.findByRole("option", { name: "Limpeza" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Categoria")).toHaveValue(categoryId);

    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Ma" },
    });
    fireEvent.change(screen.getByLabelText("Valor"), {
      target: { value: "45,90" },
    });
    expect(
      screen.getByRole("button", { name: "Cadastrar despesa" }),
    ).toHaveAccessibleDescription("Falta: Descrição (pelo menos 3 caracteres).");
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
