import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("requires broadcast text, discards a stale preview and shows preview errors", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      storedUser({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Aryana Dutra",
        email: "admin@movimenta.local",
        role: "reception",
      }),
    );
    let failPreview = false;
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/communications/broadcast/preview")) {
        return failPreview
          ? ({
              ok: false,
              status: 400,
              json: async () => ({
                code: "VALIDATION_ERROR",
                message: "Dados inválidos.",
              }),
            } as Response)
          : ({
              ok: true,
              status: 200,
              json: async () => ({
                preview: true,
                channel: "whatsapp",
                matched: 0,
                queued: 0,
                skipped: [],
              }),
            } as Response);
      }
      if (url.includes("/communications"))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            deliveryMode: "outbox_only",
            preferences: [],
            messages: [],
          }),
        } as Response;
      return { ok: true, status: 200, json: async () => [] } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/comunicacoes"]}>
        <App />
      </MemoryRouter>,
    );
    const panel = (
      await screen.findByRole("heading", { name: "Comunicado segmentado" })
    ).closest("section")!;
    fireEvent.submit(
      within(panel).getByLabelText("Texto do comunicado").closest("form")!,
    );
    expect(
      within(panel).getByText("Escreva o texto do comunicado."),
    ).toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([url]) => String(url).includes("/broadcast")),
    ).toBe(false);

    fireEvent.change(within(panel).getByLabelText("Texto do comunicado"), {
      target: { value: "Aviso geral" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Ver prévia" }));
    expect(
      await within(panel).findByText(
        "Nenhum cliente receberia este comunicado.",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole("button", { name: "Enfileirar comunicado" }),
    ).not.toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText("Texto do comunicado"), {
      target: { value: "Aviso geral 2" },
    });
    expect(
      within(panel).queryByText("Nenhum cliente receberia este comunicado."),
    ).not.toBeInTheDocument();

    failPreview = true;
    fireEvent.click(within(panel).getByRole("button", { name: "Ver prévia" }));
    expect(
      await within(panel).findByText("Dados inválidos."),
    ).toBeInTheDocument();
  });
});
