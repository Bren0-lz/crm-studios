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
      screen.getByText(
        "Para cadastrar, preencha: descrição, categoria, valor.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cadastrar despesa" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Criar categoria" }));
    fireEvent.change(screen.getByLabelText("Criar categoria"), {
      target: { value: "Limpeza" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Criar" }));
    expect(
      await screen.findByRole("option", { name: "Limpeza" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Categoria")).toHaveValue(categoryId);

    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Material de limpeza" },
    });
    fireEvent.change(screen.getByLabelText("Valor"), {
      target: { value: "45,90" },
    });
    expect(screen.queryByText(/Para cadastrar, preencha/)).toBeNull();
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
