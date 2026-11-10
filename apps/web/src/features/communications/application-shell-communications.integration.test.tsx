import { fireEvent, render, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  openSettingsSection,
  relationshipSettingsFixture,
  storedUser,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("application shell", () => {
  it("lets the owner edit relationship deadlines and messages in settings", async () => {
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
    const settings = relationshipSettingsFixture();
    let putBody: Record<string, unknown> | undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes("/relationship/settings") && init?.method === "PUT") {
        putBody = JSON.parse(String(init.body));
        return { ok: true, status: 200, json: async () => putBody } as Response;
      }
      const body = url.includes("/relationship/settings")
        ? settings
        : url.includes("/admin/clinic-settings")
          ? null
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    const section = await openSettingsSection("Prazos e mensagens");
    expect(await within(section).findByText("{{nome}}")).toBeInTheDocument();
    expect(section).toHaveTextContent("primeiro nome do cliente");
    const planDays = await within(section).findByLabelText(
      "Plano acabando: avisar quantos dias antes do fim",
    );
    expect(planDays).toHaveValue(7);
    fireEvent.change(planDays, { target: { value: "10" } });
    fireEvent.change(within(section).getByLabelText("Mensagem: Aniversário"), {
      target: { value: "Feliz aniversário, {{nome}}!" },
    });
    fireEvent.click(
      within(section).getByRole("button", {
        name: "Salvar prazos e mensagens",
      }),
    );
    await vi.waitFor(() => expect(putBody).toBeDefined());
    expect(putBody).toEqual({
      ...settings,
      planExpiringDays: 10,
      messages: {
        ...settings.messages,
        birthday: "Feliz aniversário, {{nome}}!",
      },
    });
    expect(
      await within(section).findByText("Prazos e mensagens salvos."),
    ).toBeInTheDocument();
  });
});
