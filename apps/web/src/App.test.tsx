import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

vi.stubGlobal("fetch", vi.fn());
afterEach(() => {
  cleanup();
  vi.mocked(fetch).mockReset();
});

describe("application shell", () => {
  it("shows the login when there is no session", () => {
    localStorage.clear();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Acesse sua clínica" }),
    ).toBeInTheDocument();
  });

  it("opens the SOAP editor for an authenticated clinical user", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Mariana Costa",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const patient = {
        id: "99999999-9999-4999-8999-999999999999",
        fullName: "Helena Almeida",
      };
      const body = url.includes("/clinical-workspace/")
        ? {
            patient,
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
            ? [patient]
            : [
                {
                  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                  patientId: patient.id,
                  patientName: "Helena Almeida",
                  professionalName: "Dra. Ana Martins",
                  startsAt: new Date().toISOString(),
                  status: "completed",
                },
              ];
      return { ok: true, status: 200, json: async () => body } as Response;
    });

    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("heading", { name: "Prontuários" }),
    ).toBeInTheDocument();
    const newRecord = await screen.findByRole("button", {
      name: "Nova evolução",
    });
    fireEvent.click(newRecord);
    expect(
      screen.getByRole("heading", { name: "Nova evolução clínica" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/S — Subjetivo/)).toBeInTheDocument();
  });

  it("opens a plan sale with patient and service data", async () => {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem(
      "crm.auth.user",
      JSON.stringify({
        id: "22222222-2222-4222-8222-222222222222",
        fullName: "Mariana Costa",
        email: "admin@movimenta.local",
        role: "owner",
      }),
    );
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/patients")
        ? [
            {
              id: "99999999-9999-4999-8999-999999999999",
              fullName: "Helena Almeida",
            },
          ]
        : url.includes("/services")
          ? [
              {
                id: "77777777-7777-4777-8777-777777777777",
                name: "Fisioterapia individual",
              },
            ]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    const action = await screen.findByRole("button", { name: "Novo plano" });
    fireEvent.click(action);
    expect(
      screen.getByRole("heading", { name: "Novo plano" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Paciente")).toHaveValue(
      "99999999-9999-4999-8999-999999999999",
    );
  });
});
