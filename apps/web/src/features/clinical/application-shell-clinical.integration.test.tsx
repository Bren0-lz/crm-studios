import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

describe("application shell", () => {
  it("opens the assessment form and offers no clinical evolution", async () => {
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
        : url.includes("/patients")
          ? [patient]
          : [];
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
    fireEvent.click(
      await screen.findByRole("button", { name: /Helena Almeida/ }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Registrar avaliação" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Registrar avaliação" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Nova evolução|Evoluir/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /Evoluções/ }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(([input]) =>
          /clinical-records|clinical-appointment-options/.test(String(input)),
        ),
    ).toBe(false);
  });

  it("prints goals and assessments without legacy evolutions", async () => {
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
    const patient = {
      id: "99999999-9999-4999-8999-999999999999",
      fullName: "Helena Almeida",
      recordNumber: 12,
    };
    const record = {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      appointmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientId: patient.id,
      professionalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      status: "finalized",
      version: 2,
      authorName: "Aryana Dutra",
      patientName: "Helena Almeida",
      professionalName: "Dra. Ana Martins",
      professionalCrefito: "CREFITO-3 123456-F",
      appointmentStartsAt: new Date().toISOString(),
      subjective: "Relato",
      objective: "Exame",
      assessment: "Evolução positiva",
      plan: "Manter",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/clinical-workspace/")
        ? {
            patient,
            records: [record],
            templates: [],
            assessments: [],
            goals: [
              {
                id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                patientId: patient.id,
                title: "Subir escadas sem dor",
                description: "Sem apoio do corrimão",
                status: "active",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            measurements: [],
            closures: [],
            attachments: [],
            addenda: [],
          }
        : url.includes("/patients")
          ? [patient]
          : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/prontuarios"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /Helena Almeida/ }),
    );
    const summary = (
      await screen.findByText("Prontuário longitudinal")
    ).closest(".clinical-print-summary")!;
    expect(summary).toHaveTextContent("Subir escadas sem dor · Ativo");
    expect(summary).toHaveTextContent("Avaliações estruturadas");
    expect(summary).not.toHaveTextContent("Evoluções SOAP");
    expect(summary).not.toHaveTextContent("Evolução positiva");
    expect(summary).not.toHaveTextContent("active");
  });
});
