import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { professionalColorStyle } from "../../tag-colors";

describe("professional color (V10)", () => {
  it("accepts only #rrggbb colors as the --pro-color variable", () => {
    expect(professionalColorStyle("#9a6bc4")).toEqual({
      "--pro-color": "#9a6bc4",
    });
    expect(professionalColorStyle("red; background: url(x)")).toBeUndefined();
    expect(professionalColorStyle(undefined)).toBeUndefined();
  });

  it("keeps the professional color on dots and the day grid avatar without side borders", async () => {
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
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "a1",
      patientName: "Helena Almeida",
      status: "scheduled",
      professionalId: "p1",
      professionalName: "Clara Mendes",
      professionalColor: "#9a6bc4",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceName: "Dançaterapia",
      roomName: "Sala de Dança",
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/appointments?")
        ? [appointment]
        : url.includes("/professionals")
          ? [
              {
                id: "p1",
                fullName: "Clara Mendes",
                color: "#9a6bc4",
                active: true,
              },
            ]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    const color = (element: Element) =>
      (element as HTMLElement).style.getPropertyValue("--pro-color");
    const card = await screen.findByRole("button", {
      name: /Detalhes de Helena Almeida/,
    });
    expect(color(card)).toBe("#9a6bc4");
    const header = screen.getByRole("columnheader", { name: /Clara Mendes/ });
    const avatar = within(header).getByText("CM");
    expect(avatar).toHaveClass("pro-avatar");
    expect(color(avatar)).toBe("#9a6bc4");

    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    const weekCard = await screen.findByRole("button", {
      name: /Detalhes de Helena Almeida/,
    });
    expect(color(weekCard)).toBe("#9a6bc4");
    expect(weekCard.querySelector(".pro-dot")).toBeInTheDocument();
    expect(within(weekCard).getByText("Helena Almeida")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mês" }));
    const monthCard = await screen.findByRole("button", {
      name: /Detalhes de Helena Almeida/,
    });
    expect(color(monthCard)).toBe("#9a6bc4");
    expect(monthCard.querySelector(".pro-dot")).toBeInTheDocument();
    expect(within(monthCard).getByText("Helena Almeida")).toBeInTheDocument();
    expect(
      readFileSync(`${process.cwd()}/src/styles/05-agenda.css`, "utf8"),
    ).not.toMatch(/border-left\s*:/);
  });
});
