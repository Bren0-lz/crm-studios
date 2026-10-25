import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { localIsoDate } from "../../shared/lib/formatting";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

function renderAgenda() {
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
  const at = (hour: number) => {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };
  const appointment = (
    id: string,
    name: string,
    professionalId: string,
    hour: number,
    status = "scheduled",
  ) => ({
    id,
    patientName: name,
    status,
    professionalId,
    professionalName: professionalId === "p1" ? "Clara Mendes" : "Bia Souza",
    professionalColor: professionalId === "p1" ? "#9a6bc4" : "#3f7fbf",
    startsAt: at(hour),
    endsAt: at(hour + 1),
    serviceName: "Pilates",
    roomName: "Estúdio",
  });
  vi.mocked(fetch).mockImplementation(async (input) => {
    const url = String(input);
    const body = url.includes("/appointments?")
      ? [
          appointment("a1", "Helena Almeida", "p1", 9),
          appointment("a2", "Lucas Ribeiro", "p2", 10),
          appointment("a3", "Paula Cancelada", "p1", 11, "cancelled"),
        ]
      : url.includes("/group-sessions?")
        ? [
            {
              id: "g1",
              groupId: "t1",
              groupName: "Dançaterapia A",
              professionalId: "p1",
              professionalName: "Clara Mendes",
              roomId: "r1",
              roomName: "Sala de Dança",
              startsAt: at(7),
              endsAt: at(8),
              status: "scheduled",
              attendanceCount: 0,
            },
          ]
        : url.includes("/professionals")
          ? [
              {
                id: "p1",
                fullName: "Clara Mendes",
                color: "#9a6bc4",
                whatsapp: "11988887777",
              },
              { id: "p2", fullName: "Bia Souza", color: "#3f7fbf" },
            ]
          : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/agenda"]}>
      <App />
    </MemoryRouter>,
  );
}

describe("compartilhar agenda", () => {
  it("monta a agenda do profissional no período e abre o WhatsApp do cadastro do usuário", async () => {
    renderAgenda();
    fireEvent.click(await screen.findByRole("button", { name: "Dia" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Compartilhar agenda" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Compartilhar agenda" });
    expect(within(dialog).getByLabelText("Profissional")).toHaveValue("p1");
    expect(within(dialog).getByLabelText("De")).toHaveValue(localIsoDate());
    expect(within(dialog).getByLabelText("Até")).toHaveValue(localIsoDate());
    expect(
      within(dialog).getByLabelText("WhatsApp do profissional"),
    ).toHaveValue("(11) 98888-7777");
    const message = await within(dialog).findByText(/Agenda de Clara Mendes/);
    expect(message.textContent).toContain(
      "07:00–08:00 · Turma Dançaterapia A (Sala de Dança)",
    );
    expect(message.textContent).toContain(
      "09:00–10:00 · Helena Almeida — Pilates (Estúdio)",
    );
    // Cancelados e atendimentos de outro profissional ficam de fora.
    expect(message.textContent).not.toContain("Paula Cancelada");
    expect(message.textContent).not.toContain("Lucas Ribeiro");
    const link = within(dialog).getByRole("link", {
      name: "Enviar pelo WhatsApp",
    });
    expect(link).toHaveAttribute(
      "href",
      `https://wa.me/5511988887777?text=${encodeURIComponent(message.textContent!)}`,
    );
    expect(link).toHaveAttribute("target", "_blank");

    // Profissional sem WhatsApp no cadastro: o número é informado para este envio.
    fireEvent.change(within(dialog).getByLabelText("Profissional"), {
      target: { value: "p2" },
    });
    expect(
      within(dialog).getByLabelText("WhatsApp do profissional"),
    ).toHaveValue("");
    expect(
      within(dialog).getByRole("button", { name: "Enviar pelo WhatsApp" }),
    ).toBeDisabled();
    expect(within(dialog).getByText("Falta: WhatsApp com DDD.")).toBeVisible();
    expect(
      within(dialog).getByText(/Agenda de Bia Souza/).textContent,
    ).toContain("Lucas Ribeiro");
    fireEvent.change(
      within(dialog).getByLabelText("WhatsApp do profissional"),
      {
        target: { value: "21977776666" },
      },
    );
    expect(
      within(dialog).getByRole("link", { name: "Enviar pelo WhatsApp" }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("https://wa.me/5521977776666?text="),
    );
  });

  it("recusa período invertido ou maior que 31 dias", async () => {
    renderAgenda();
    fireEvent.click(
      await screen.findByRole("button", { name: "Compartilhar agenda" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Compartilhar agenda" });
    fireEvent.change(within(dialog).getByLabelText("De"), {
      target: { value: "2026-10-10" },
    });
    fireEvent.change(within(dialog).getByLabelText("Até"), {
      target: { value: "2026-10-01" },
    });
    expect(
      within(dialog).getByText(
        "A data final precisa ser igual ou posterior à inicial.",
      ),
    ).toHaveClass("form-error");
    fireEvent.change(within(dialog).getByLabelText("Até"), {
      target: { value: "2026-11-15" },
    });
    expect(
      within(dialog).getByText("Escolha um período de até 31 dias."),
    ).toHaveClass("form-error");
    expect(
      within(dialog).getByRole("button", { name: "Enviar pelo WhatsApp" }),
    ).toBeDisabled();
  });
});
