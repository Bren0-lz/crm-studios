import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(10, 0, 0, 0);
  return date;
}

function dayMonth(date: Date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

describe("clinical appointment picker", () => {
  it("lists the latest appointments first, only the last 90 days by default, and filters by name or date", async () => {
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
    const appointment = (id: string, patientName: string, startsAt: Date) => ({
      id,
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName,
      professionalName: "Dra. Ana Martins",
      startsAt: startsAt.toISOString(),
      status: "completed",
    });
    const old = daysAgo(120);
    const month = daysAgo(30);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/clinical-workspace/")
        ? {
            patient: {
              id: "99999999-9999-4999-8999-999999999999",
              fullName: "Helena",
            },
            records: [],
            templates: [],
            assessments: [],
            goals: [],
            measurements: [],
            closures: [],
          }
        : url.includes("/clinical-records")
          ? []
          : url.includes("/patients")
            ? [
                {
                  id: "99999999-9999-4999-8999-999999999999",
                  fullName: "Helena",
                },
              ]
            : url.includes("/appointments")
              ? [
                  appointment("a-old", "Joana Prado", old),
                  appointment("a-month", "Helena Almeida", month),
                  appointment("a-today", "Viviane Araújo", daysAgo(0)),
                ]
              : {};
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    const newRecord = await screen.findByRole("button", {
      name: "Nova evolução",
    });
    await waitFor(() => expect(newRecord).toBeEnabled());
    fireEvent.click(newRecord);
    const picker = await screen.findByRole("combobox", {
      name: "Atendimento",
    });
    expect(picker).toHaveValue("");
    fireEvent.focus(picker);
    const names = () =>
      screen.queryAllByRole("option").map((item) => item.textContent);
    expect(names()).toEqual([
      expect.stringContaining("Viviane Araújo"),
      expect.stringContaining("Helena Almeida"),
    ]);

    fireEvent.change(picker, { target: { value: "araujo" } });
    expect(names()).toEqual([expect.stringContaining("Viviane Araújo")]);

    fireEvent.change(picker, { target: { value: dayMonth(month) } });
    expect(names()).toEqual([expect.stringContaining("Helena Almeida")]);

    fireEvent.change(picker, { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("Incluir mais antigos"));
    fireEvent.focus(picker);
    expect(names()).toEqual([
      expect.stringContaining("Viviane Araújo"),
      expect.stringContaining("Helena Almeida"),
      expect.stringContaining("Joana Prado"),
    ]);
    fireEvent.click(screen.getByRole("option", { name: /Joana Prado/ }));
    expect((picker as HTMLInputElement).value).toContain(
      "Joana Prado · Dra. Ana Martins",
    );
  });
});
