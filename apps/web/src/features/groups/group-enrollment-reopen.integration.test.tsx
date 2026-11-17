import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const clinicId = "11111111-1111-4111-8111-111111111111";
const group = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId,
  name: "Pilates Turma A",
  sequence: 1,
  serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  serviceName: "Pilates",
  professionalId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  professionalName: "Dra. Ana Martins",
  roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  roomName: "Sala Movimento",
  capacity: 4,
  activeEnrollments: 0,
  waitlistCount: 0,
  weeklySlots: [{ weekday: 3, startTime: "18:00", endTime: "19:00" }],
  active: true,
  createdAt: "2026-09-01T12:00:00Z",
};
const patients = [
  {
    id: "f1111111-1111-4111-8111-111111111111",
    fullName: "TESTE Cliente Avulso",
    tags: [],
  },
  {
    id: "f2222222-2222-4222-8222-222222222222",
    fullName: "TESTE Cliente Pacote",
    tags: [],
  },
];

function renderGroups() {
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
  vi.mocked(fetch).mockImplementation(async (input, options) => {
    const url = new URL(String(input), "http://localhost");
    const term = (url.searchParams.get("search") ?? "").toLowerCase();
    const body =
      options?.method === "POST"
        ? {
            id: "e1111111-1111-4111-8111-111111111111",
            clinicId,
            patientName: "TESTE Cliente Avulso",
            status: "active",
            enrolledAt: "2026-10-17T12:00:00Z",
            updatedAt: "2026-10-17T12:00:00Z",
            ...JSON.parse(String(options.body)),
          }
        : url.pathname.includes("/groups/workspace")
          ? {
              groups: [group],
              enrollments: [],
              sessions: [],
              attendance: [],
              replacementCredits: [],
            }
          : url.pathname.includes("/patients/options")
            ? patients.filter((patient) =>
                patient.fullName.toLowerCase().includes(term),
              )
            : [];
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={["/turmas"]}>
      <App />
    </MemoryRouter>,
  );
}

async function openEnrollment() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Matricular cliente" }),
  );
  return screen.findByRole("dialog", { name: "Nova matrícula" });
}

async function choosePatient(
  dialog: HTMLElement,
  search: string,
  name: string,
) {
  fireEvent.change(within(dialog).getByRole("combobox", { name: "Cliente" }), {
    target: { value: search },
  });
  fireEvent.click(await within(dialog).findByRole("option", { name }));
}

describe("nova matrícula reaberta", () => {
  it("começa sem cliente depois de fechar com cliente escolhido", async () => {
    renderGroups();
    let dialog = await openEnrollment();
    await choosePatient(dialog, "Avulso", "TESTE Cliente Avulso");
    expect(
      within(dialog).getByRole("combobox", { name: "Cliente" }),
    ).toHaveValue("TESTE Cliente Avulso");

    fireEvent.click(
      within(dialog).getAllByRole("button", { name: "Fechar" })[0]!,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(
      screen.queryByRole("dialog", { name: "Nova matrícula" }),
    ).not.toBeInTheDocument();

    dialog = await openEnrollment();
    const input = within(dialog).getByRole("combobox", { name: "Cliente" });
    expect(input).toHaveValue("");

    await choosePatient(dialog, "Pacote", "TESTE Cliente Pacote");
    expect(input).toHaveValue("TESTE Cliente Pacote");
    expect(
      within(dialog).queryByText("Nenhum cliente encontrado"),
    ).not.toBeInTheDocument();
  });

  it("começa sem cliente depois de uma matrícula concluída", async () => {
    renderGroups();
    let dialog = await openEnrollment();
    fireEvent.change(within(dialog).getByLabelText("Turma"), {
      target: { value: group.id },
    });
    await choosePatient(dialog, "Avulso", "TESTE Cliente Avulso");
    fireEvent.click(within(dialog).getByRole("button", { name: "Matricular" }));
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Nova matrícula" }),
      ).not.toBeInTheDocument(),
    );

    dialog = await openEnrollment();
    const input = within(dialog).getByRole("combobox", { name: "Cliente" });
    expect(input).toHaveValue("");
    expect(within(dialog).getByLabelText("Turma")).toHaveValue("");

    await choosePatient(dialog, "Pacote", "TESTE Cliente Pacote");
    expect(input).toHaveValue("TESTE Cliente Pacote");
  });
});
