import type { AutomaticPatientTag } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  openSettingsSection,
  patientTag,
  storedUser,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

const admin = {
  id: "22222222-2222-4222-8222-222222222222",
  fullName: "Aryana Dutra",
  email: "admin@movimenta.local",
  role: "owner",
};

function automaticTag(
  key: AutomaticPatientTag["key"],
  defaultName: string,
  overrides: Partial<AutomaticPatientTag> = {},
): AutomaticPatientTag {
  const defaultColor = key === "overdue_payment" ? "#c2410c" : "#6d28d9";
  return {
    key,
    defaultName,
    name: defaultName,
    color: defaultColor,
    defaultColor,
    category: key === "overdue_payment" ? "financial" : "status",
    description: `Regra de ${defaultName}.`,
    customized: false,
    ...overrides,
  };
}

const defaults = () => [
  automaticTag("overdue_payment", "Pagamento atrasado"),
  automaticTag("missing_cpf", "Falta CPF"),
  automaticTag("invalid_cpf", "CPF inválido"),
  automaticTag("incomplete_registration", "Cadastro incompleto"),
  automaticTag("missing_email", "Sem e-mail"),
];

describe("etiquetas automáticas com nome e cor da clínica (AT1)", () => {
  it("mostra o nome e a cor configurados no selo e no filtro, filtrando pela regra", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(admin));
    const automatic = defaults().map((tag) =>
      tag.key === "overdue_payment"
        ? { ...tag, name: "Em atraso", color: "#123456", customized: true }
        : tag,
    );
    const late = {
      id: "99999999-9999-4999-8999-999999999991",
      recordNumber: "PAC-00001",
      fullName: "Lara Atrasada",
      phone: "11987654321",
      tags: ["Pilates", "Pagamento atrasado"],
      status: "active",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/patient-tags/automatic"))
        return jsonResponse(automatic);
      if (url.includes("/patient-tags"))
        return jsonResponse([patientTag("Pilates", "#276749", 1)]);
      if (url.includes("/patients?") || url.endsWith("/patients"))
        return jsonResponse([late]);
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
    const badge = await within(row).findByText("Em atraso");
    expect(badge.style.getPropertyValue("--tag-color")).toBe("#123456");
    expect(within(row).queryByText("Pagamento atrasado")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Filtros/ }));
    const filter = await screen.findByRole("group", { name: "Etiquetas" });
    const chip = within(filter).getByRole("button", { name: /^Em atraso/ });
    expect(chip.style.getPropertyValue("--tag-color")).toBe("#123456");
    fireEvent.click(chip);
    expect(
      screen.getByRole("button", { name: "Abrir ficha de Lara Atrasada" }),
    ).toBeInTheDocument();
  });

  it("edita o nome e a cor em Configurações e restaura o padrão", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser(admin));
    let automatic = defaults();
    const writes: { method: string; url: string; body: unknown }[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/patient-tags/automatic")) {
        if (method === "GET") return jsonResponse(automatic);
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        writes.push({ method, url, body });
        const key = url.split("/").pop();
        automatic = automatic.map((tag) =>
          tag.key !== key
            ? tag
            : method === "DELETE"
              ? defaults().find((item) => item.key === key)!
              : { ...tag, ...body, customized: true },
        );
        return jsonResponse(automatic.find((tag) => tag.key === key));
      }
      if (url.includes("/patient-tags"))
        return jsonResponse([patientTag("Pilates", "#276749", 3)]);
      return jsonResponse([]);
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection("Etiquetas");
    const list = await screen.findByRole("list", {
      name: "Etiquetas automáticas",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(within(list).getByText("Regra de Sem e-mail.")).toBeInTheDocument();
    // As automáticas não entram na lista das configuradas.
    expect(
      within(
        screen.getByRole("list", { name: "Etiquetas configuradas" }),
      ).queryByText("Sem e-mail"),
    ).toBeNull();

    fireEvent.click(
      within(list).getByRole("button", {
        name: "Editar etiqueta automática Sem e-mail",
      }),
    );
    let dialog = await screen.findByRole("dialog", {
      name: /Editar etiqueta automática/,
    });
    expect(
      within(dialog).queryByRole("button", { name: /Restaurar padrão/ }),
    ).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("Nome da etiqueta"), {
      target: { value: "Pedir e-mail" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cor Turquesa" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar etiqueta" }),
    );
    expect(
      await screen.findByText("Etiqueta automática atualizada."),
    ).toBeInTheDocument();
    expect(writes[0]).toMatchObject({
      method: "PATCH",
      url: expect.stringContaining("/patient-tags/automatic/missing_email"),
      body: { name: "Pedir e-mail", color: "#0d9488" },
    });
    expect(within(list).getByText("Pedir e-mail")).toBeInTheDocument();
    expect(within(list).getByText("Padrão: Sem e-mail")).toBeInTheDocument();

    fireEvent.click(
      within(list).getByRole("button", {
        name: "Editar etiqueta automática Pedir e-mail",
      }),
    );
    dialog = await screen.findByRole("dialog", {
      name: /Editar etiqueta automática/,
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Restaurar padrão/ }),
    );
    expect(
      await screen.findByText("Etiqueta automática restaurada."),
    ).toBeInTheDocument();
    expect(writes[1]).toMatchObject({ method: "DELETE" });
    expect(within(list).getByText("Sem e-mail")).toBeInTheDocument();
  });
});
