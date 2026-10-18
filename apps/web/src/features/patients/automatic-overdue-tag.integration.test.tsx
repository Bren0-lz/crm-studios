import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { patientTag, storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

describe("etiqueta automática 'Pagamento atrasado' (QC7)", () => {
  it("aparece como selo e no filtro, mas não é oferecida para marcar no cadastro", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    const late = {
      id: "99999999-9999-4999-8999-999999999991",
      recordNumber: "PAC-00001",
      fullName: "Lara Atrasada",
      phone: "11987654321",
      tags: ["Pilates", "Pagamento atrasado"],
      status: "active",
    };
    const onTime = {
      id: "99999999-9999-4999-8999-999999999992",
      recordNumber: "PAC-00002",
      fullName: "Otávio Em Dia",
      phone: "11987654322",
      tags: ["Pilates"],
      status: "active",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/patient-tags"))
        return jsonResponse([patientTag("Pilates", "#276749", 2)]);
      if (url.includes("/patients?") || url.endsWith("/patients"))
        return jsonResponse([late, onTime]);
      return jsonResponse([]);
    });
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <App />
      </MemoryRouter>,
    );
    const row = await screen.findByRole("button", {
      name: "Abrir ficha de Lara Atrasada",
    });
    // Selo na cor da categoria Financeiro.
    const badge = within(row).getByText("Pagamento atrasado");
    expect(badge).toHaveClass("tag-colored");
    expect(badge.style.getPropertyValue("--tag-color")).toBe("#c2410c");

    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const filter = await screen.findByRole("group", { name: "Etiquetas" });
    const automatic = within(filter).getByRole("button", {
      name: /^Pagamento atrasado/,
    });
    expect(automatic.textContent).toBe("Pagamento atrasado1");
    expect(automatic).toHaveAttribute(
      "title",
      "Etiqueta automática: cliente com parcela vencida e em aberto.",
    );
    fireEvent.click(automatic);
    expect(
      screen.getByRole("button", { name: "Abrir ficha de Lara Atrasada" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Abrir ficha de Otávio Em Dia" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(
        screen.getByRole("button", { name: "Abrir ficha de Lara Atrasada" }),
      ).getByRole("button", { name: "Editar Lara Atrasada" }),
    );
    const dialog = screen.getByRole("dialog");
    const choices = within(dialog).getByRole("group", { name: "Etiquetas" });
    expect(
      within(choices).getByRole("button", { name: "Pilates" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(choices).queryByRole("button", { name: "Pagamento atrasado" }),
    ).not.toBeInTheDocument();
  });
});
