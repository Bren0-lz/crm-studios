import type { OutboundMessage } from "@crm/contracts";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

function message(overrides: Partial<OutboundMessage>): OutboundMessage {
  return {
    id: "m",
    clinicId: "11111111-1111-4111-8111-111111111111",
    patientId: "p",
    patientName: "Cliente",
    channel: "whatsapp",
    kind: "manual",
    recipient: "11999990000",
    body: "Olá!",
    status: "queued",
    scheduledFor: past,
    attempts: 0,
    createdAt: past,
    ...overrides,
  };
}

function setup() {
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
  const messages = [
    message({
      id: "m1",
      patientId: "p1",
      patientName: "Viviane Araújo",
      body: "Olá, Viviane!",
    }),
    message({
      id: "m2",
      patientId: "p2",
      patientName: "Helena Almeida",
      kind: "appointment_reminder",
    }),
    message({
      id: "m3",
      patientId: "p3",
      patientName: "Joana Prado",
      kind: "payment_reminder",
      status: "sent",
    }),
    message({
      id: "m4",
      patientId: "p4",
      patientName: "Ana Lima",
      kind: "birthday_reminder",
      scheduledFor: future,
    }),
  ];
  const completions: Array<{ url: string; status: string }> = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes("/complete")) {
      const { status } = JSON.parse(String(init?.body));
      completions.push({ url, status });
      const id = url.split("messages/")[1]!.split("/")[0]!;
      const item = messages.find((entry) => entry.id === id)!;
      item.status = status;
      return { ok: true, status: 200, json: async () => item } as Response;
    }
    const body = /\/communications(\?|$)/.test(url)
      ? { deliveryMode: "outbox_only", preferences: [], messages }
      : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/comunicacoes?aba=fila"]}>
      <App />
    </MemoryRouter>,
  );
  return { completions };
}

function row(name: string) {
  return screen
    .getByText(name, { selector: ".message-row-head strong" })
    .closest("article") as HTMLElement;
}

describe("message queue", () => {
  it("opens WhatsApp and asks, on return to the tab, whether the message was sent", async () => {
    const { completions } = setup();
    await screen.findByText("Viviane Araújo", {
      selector: ".message-row-head strong",
    });
    const viviane = row("Viviane Araújo");
    expect(within(viviane).getByText("Na fila")).toHaveClass("status-pill");
    const send = within(viviane).getByRole("link", {
      name: "Enviar pelo WhatsApp",
    });
    expect(send).toHaveAttribute(
      "href",
      `https://wa.me/5511999990000?text=${encodeURIComponent("Olá, Viviane!")}`,
    );
    // Uma ação principal e o resto no menu "…".
    expect(within(viviane).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(send);
    expect(completions).toHaveLength(0);
    document.dispatchEvent(new Event("visibilitychange"));
    const dialog = await screen.findByRole("dialog", {
      name: "Mensagem enviada para Viviane Araújo?",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Sim, enviada" }),
    );
    await waitFor(() => expect(completions).toHaveLength(1));
    expect(completions[0]).toMatchObject({ status: "sent" });
    expect(completions[0]!.url).toContain("/messages/m1/complete");
  });

  it("filters by type and status and marks or discards selected messages in bulk", async () => {
    const { completions } = setup();
    await screen.findByText("Viviane Araújo", {
      selector: ".message-row-head strong",
    });
    const names = () =>
      Array.from(document.querySelectorAll(".message-row-head strong")).map(
        (item) => item.textContent,
      );
    fireEvent.change(screen.getByLabelText("Tipo de mensagem"), {
      target: { value: "payment_reminder" },
    });
    expect(names()).toEqual(["Joana Prado"]);
    fireEvent.change(screen.getByLabelText("Tipo de mensagem"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Situação da mensagem"), {
      target: { value: "queued" },
    });
    expect(names()).toEqual(["Viviane Araújo", "Helena Almeida", "Ana Lima"]);

    fireEvent.click(
      screen.getByLabelText("Selecionar mensagem para Viviane Araújo"),
    );
    fireEvent.click(screen.getByLabelText("Selecionar mensagem para Ana Lima"));
    const bar = screen.getByRole("region", { name: "Ações em lote" });
    expect(
      within(bar).getByRole("button", { name: "Marcar como enviadas (1)" }),
    ).toBeEnabled();
    expect(
      within(bar).getByRole("button", { name: "Descartar (2)" }),
    ).toBeEnabled();

    fireEvent.click(
      within(bar).getByRole("button", { name: "Marcar como enviadas (1)" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Marcar como enviadas" });
    expect(dialog).toHaveTextContent("1 ficam de fora");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Marcar como enviadas" }),
    );
    expect(
      await screen.findByText("1 mensagem(ns) marcada(s) como enviada(s)."),
    ).toBeInTheDocument();
    expect(completions).toEqual([
      expect.objectContaining({
        status: "sent",
        url: expect.stringContaining("/m1/"),
      }),
    ]);

    fireEvent.click(screen.getByLabelText("Selecionar mensagem para Ana Lima"));
    fireEvent.click(
      within(screen.getByRole("region", { name: "Ações em lote" })).getByRole(
        "button",
        { name: "Descartar (1)" },
      ),
    );
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Descartar mensagens" }),
      ).getByRole("button", { name: "Descartar" }),
    );
    await waitFor(() => expect(completions).toHaveLength(2));
    expect(completions[1]).toMatchObject({ status: "cancelled" });
    expect(completions[1]!.url).toContain("/m4/");
  });
});
