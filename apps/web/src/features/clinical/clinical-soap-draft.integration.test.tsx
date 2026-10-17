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

describe("SOAP draft", () => {
  it("saves a draft with only the subjective step and asks for the rest before finalizing", async () => {
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
    };
    const appointmentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const startsAt = new Date().toISOString();
    const posts: Array<{ url: string; body: unknown }> = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        posts.push({
          url,
          body: init.body ? JSON.parse(String(init.body)) : null,
        });
        const input = JSON.parse(String(init.body ?? "{}"));
        return {
          ok: true,
          status: 201,
          json: async () => ({
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            appointmentId,
            patientId: patient.id,
            patientName: patient.fullName,
            professionalId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            professionalName: "Dra. Ana Martins",
            professionalCrefito: "CREFITO-3 1-F",
            appointmentStartsAt: startsAt,
            status: "draft",
            version: 1,
            authorName: "Aryana Dutra",
            subjective: input.subjective,
            objective: input.objective,
            assessment: input.assessment,
            plan: input.plan,
            createdAt: startsAt,
            updatedAt: startsAt,
          }),
        } as Response;
      }
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
            : url.includes("/appointments")
              ? [
                  {
                    id: appointmentId,
                    patientId: patient.id,
                    patientName: patient.fullName,
                    professionalName: "Dra. Ana Martins",
                    startsAt,
                    status: "completed",
                  },
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
    const dialog = screen.getByRole("dialog", {
      name: "Nova evolução clínica",
    });
    const picker = within(dialog).getByRole("combobox", {
      name: "Atendimento",
    });
    fireEvent.focus(picker);
    fireEvent.click(
      within(dialog).getByRole("option", { name: /Helena Almeida/ }),
    );
    fireEvent.change(within(dialog).getByLabelText(/S — Subjetivo/), {
      target: { value: "Dor ao subir escadas." },
    });
    expect(within(dialog).getByLabelText(/O — Objetivo/)).not.toBeRequired();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar rascunho" }),
    );
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.body).toMatchObject({
      appointmentId,
      subjective: "Dor ao subir escadas.",
      objective: "",
    });

    fireEvent.click(await screen.findByRole("button", { name: "Finalizar" }));
    const finalize = screen.getByRole("dialog", { name: "Finalizar evolução" });
    expect(finalize).toHaveTextContent(
      "Faltam as etapas: O — Objetivo, A — Avaliação, P — Plano.",
    );
    fireEvent.click(
      within(finalize).getByRole("button", { name: "Confirmar" }),
    );
    expect(
      await within(finalize).findByText(/Preencha antes de finalizar/),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(1);
  });
});
