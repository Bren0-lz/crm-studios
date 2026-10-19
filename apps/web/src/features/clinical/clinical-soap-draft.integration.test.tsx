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
    const other = {
      id: "88888888-8888-4888-8888-888888888888",
      fullName: "Ana Lima",
    };
    const posts: Array<{ url: string; body: unknown }> = [];
    let savedRecord: unknown = null;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        posts.push({
          url,
          body: init.body ? JSON.parse(String(init.body)) : null,
        });
        const input = JSON.parse(String(init.body ?? "{}"));
        savedRecord = {
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
        };
        return {
          ok: true,
          status: 201,
          json: async () => savedRecord,
        } as Response;
      }
      const body = url.includes("/clinical-workspace/")
        ? {
            patient: url.includes(patient.id) ? patient : other,
            records:
              url.includes(patient.id) && savedRecord ? [savedRecord] : [],
            templates: [],
            assessments: [],
            goals: [],
            measurements: [],
            closures: [],
          }
        : url.includes("/clinical-records")
          ? []
          : url.includes("/patients")
            ? [other, patient]
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
    // Sem atendimento, o rascunho não salva e o botão diz o que falta (QM14).
    const saveDraft = within(dialog).getByRole("button", {
      name: "Salvar rascunho",
    });
    expect(saveDraft).toBeDisabled();
    expect(saveDraft).toHaveAccessibleDescription("Falta: Atendimento.");
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
    expect(saveDraft).toBeEnabled();
    expect(within(dialog).queryByText(/Falta:/)).not.toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar rascunho" }),
    );
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.body).toMatchObject({
      appointmentId,
      subjective: "Dor ao subir escadas.",
      objective: "",
    });

    const timeline = (
      await screen.findByRole("heading", { name: "Linha do tempo" })
    ).closest(".clinical-timeline") as HTMLElement;
    const item = await within(timeline).findByText("Dor ao subir escadas.");
    expect(item.closest("article")).toHaveTextContent("Rascunho");
    expect(
      within(timeline).queryByText("Nenhum evento clínico registrado."),
    ).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Finalizar" }));
    const finalize = screen.getByRole("dialog", { name: "Finalizar evolução" });
    // Confirmar já vem desativado, com as etapas que faltam ligadas ao botão (QM14).
    const confirm = within(finalize).getByRole("button", { name: "Confirmar" });
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveAccessibleDescription(
      'Falta: O — Objetivo, A — Avaliação, P — Plano. Use "Editar" para completar o rascunho.',
    );
    expect(within(finalize).getAllByText(/Falta:/)).toHaveLength(1);
    expect(within(finalize).queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(confirm);
    expect(posts).toHaveLength(1);
  });
});
