import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

// RF11 (D3): o admin escolhe o alcance que já vem marcado no desconto novo do plano.
describe("Configurações › Clínica: alcance padrão do desconto", () => {
  it("começa em “só no próximo pagamento” e grava o alcance escolhido", async () => {
    const { repository } = await setupApi();
    open("/configuracoes");
    const panel = await screen.findByRole("tabpanel", { name: "Clínica" });
    const field = await within(panel).findByLabelText(
      "Alcance padrão do desconto",
    );
    expect(field).toHaveValue("once");
    expect(
      within(field)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Só no próximo pagamento",
      "Nas próximas cobranças",
      "Permanente (até remover)",
    ]);

    fireEvent.change(field, { target: { value: "next" } });
    fireEvent.click(
      within(panel).getByRole("button", { name: "Salvar configurações" }),
    );
    expect(
      await within(panel).findByText("Dados da clínica salvos."),
    ).toBeVisible();
    await waitFor(async () =>
      expect(
        (await repository.getClinicSettings(clinicId))?.defaultDiscountScope,
      ).toBe("next"),
    );
  });
});
