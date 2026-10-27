import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open, save } from "../../test-support/workflow-ui";

const pdf = new File(["%PDF-1.4\nComprovante\n%%EOF"], "pix.pdf", {
  type: "application/pdf",
});
const png = new File(
  [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])],
  "foto.png",
  { type: "image/png" },
);
const invalid = new File(["texto"], "nota.txt", { type: "text/plain" });

describe("comprovantes de pagamento", () => {
  it("anexa vários comprovantes no fim do pagamento e os mostra depois", async () => {
    const { repository } = await setupApi();
    const category = await repository.createFinancialCategory(clinicId, {
      name: "Aluguel",
      kind: "expense",
    });
    const payable = await repository.createPayable(clinicId, actorId, {
      description: "Aluguel da sala",
      supplier: "Imobiliária",
      categoryId: category.id,
      dueDate: "2040-06-10",
      amountInCents: 4000,
      notes: "",
    });
    open("/financeiro");
    fireEvent.click(
      await screen.findByRole("button", { name: /^Contas a pagar \(/ }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Pagar Aluguel da sala" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Pagar despesa" });
    const input = within(dialog).getByLabelText(
      "Adicionar comprovantes (opcional)",
    );
    fireEvent.change(input, { target: { files: [pdf, invalid] } });
    expect(
      within(dialog).getByText(
        "Use comprovantes PDF, PNG ou JPEG de até 5 MB.",
      ),
    ).toBeInTheDocument();
    fireEvent.change(input, { target: { files: [png] } });
    const selected = within(dialog).getByRole("list", {
      name: "Comprovantes selecionados",
    });
    expect(within(selected).getByText("pix.pdf")).toBeInTheDocument();
    expect(within(selected).getByText("foto.png")).toBeInTheDocument();
    expect(within(selected).queryByText("nota.txt")).not.toBeInTheDocument();
    await save("Pagar despesa", "Confirmar pagamento");
    await waitFor(async () =>
      expect(
        (
          await repository.listPaymentProofs(clinicId, "payable", payable.id)
        ).map((proof) => proof.fileName),
      ).toEqual(["pix.pdf", "foto.png"]),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Comprovantes de Aluguel da sala",
      }),
    );
    const proofs = await screen.findByRole("dialog", { name: "Comprovantes" });
    const list = await within(proofs).findByRole("list", {
      name: "Comprovantes anexados",
    });
    expect(within(list).getByText("pix.pdf")).toBeInTheDocument();
    expect(within(list).getByText("foto.png")).toBeInTheDocument();
    expect(
      within(proofs).getByRole("button", { name: "Baixar foto.png" }),
    ).toBeEnabled();
  });
});
