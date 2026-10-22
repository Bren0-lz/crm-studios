import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";

const clinicId = "11111111-1111-4111-8111-111111111111";
const patient = {
  id: "99999999-9999-4999-8999-999999999999",
  clinicId,
  recordNumber: "PAC-00001",
  fullName: "Helena Almeida",
  phone: "11987654321",
  tags: [],
  status: "active",
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-01T12:00:00.000Z",
};
const otherId = "88888888-8888-4888-8888-888888888888";
const groupId = "77777777-7777-4777-8777-777777777777";

const responses: Record<string, unknown> = {
  "/groups/workspace": {
    groups: [
      {
        id: groupId,
        clinicId,
        name: "Pilates manhã",
        sequence: 1,
        serviceId: "66666666-6666-4666-8666-666666666666",
        serviceName: "Pilates",
        professionalId: "55555555-5555-4555-8555-555555555555",
        professionalName: "Marina Costa",
        roomId: "44444444-4444-4444-8444-444444444444",
        roomName: "Sala 1",
        capacity: 6,
        weeklySlots: [{ weekday: 1, startTime: "08:00", endTime: "09:00" }],
        activeEnrollments: 1,
        waitlistCount: 0,
        active: true,
        createdAt: "2026-01-01T12:00:00.000Z",
      },
    ],
    enrollments: [
      {
        id: "e1",
        clinicId,
        groupId,
        patientId: patient.id,
        patientName: patient.fullName,
        status: "active",
        enrolledAt: "2026-02-03T12:00:00.000Z",
        startsOn: "2026-02-03",
        updatedAt: "2026-02-03T12:00:00.000Z",
      },
      {
        id: "e2",
        clinicId,
        groupId,
        patientId: otherId,
        patientName: "Outra Pessoa",
        status: "active",
        enrolledAt: "2026-02-03T12:00:00.000Z",
        startsOn: "2026-02-03",
        updatedAt: "2026-02-03T12:00:00.000Z",
      },
    ],
    sessions: [],
    attendance: [],
    replacementCredits: [],
  },
  "/relationship/suggestions": [
    {
      patientId: patient.id,
      patientName: patient.fullName,
      phone: patient.phone,
      reason: "plan_expiring",
      referenceKey: "plan-1",
      detail: "Plano termina em 3 dias",
      priority: 1,
    },
    {
      patientId: otherId,
      patientName: "Outra Pessoa",
      phone: "11900000000",
      reason: "birthday",
      referenceKey: "2026",
      detail: "Aniversário hoje",
      priority: 2,
    },
  ],
  "/communications": {
    deliveryMode: "outbox_only",
    preferences: [],
    messages: [],
  },
};

function renderRecord() {
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
    const path = new URL(url, "http://localhost").pathname.replace(
      /^\/api/,
      "",
    );
    const body = url.endsWith(`/patients/${patient.id}`)
      ? patient
      : (responses[path] ?? []);
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  render(
    <MemoryRouter initialEntries={[`/clientes/${patient.id}`]}>
      <App />
    </MemoryRouter>,
  );
}

async function openRelated(name: string) {
  const details = await screen.findByRole("region", {
    name: "Dados cadastrais",
  });
  fireEvent.click(within(details).getByRole("button", { name }));
  return screen.findByRole("dialog", { name });
}

describe("ver também na ficha do cliente", () => {
  it("mostra as turmas do cliente num modal, sem sair da ficha", async () => {
    renderRecord();
    const dialog = await openRelated("Turmas");
    expect(await within(dialog).findByText("Pilates manhã")).toBeVisible();
    expect(within(dialog).getByText("Matrícula ativa")).toBeVisible();
    expect(within(dialog).getByText(/Marina Costa/)).toBeVisible();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(1);
    expect(
      within(dialog).getByRole("link", { name: "Abrir em Turmas" }),
    ).toHaveAttribute("href", `/turmas?patientId=${patient.id}`);
    const [, footerClose] = within(dialog).getAllByRole("button", {
      name: "Fechar",
    });
    fireEvent.click(footerClose!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Helena Almeida" }),
    ).toBeVisible();
  });

  it("lista só os contatos sugeridos do cliente", async () => {
    renderRecord();
    const dialog = await openRelated("Contatos sugeridos");
    expect(await within(dialog).findByText("Plano acabando")).toBeVisible();
    expect(within(dialog).getByText("Plano termina em 3 dias")).toBeVisible();
    expect(within(dialog).queryByText("Aniversário hoje")).toBeNull();
  });

  it("mostra estado vazio quando não há comunicações", async () => {
    renderRecord();
    const dialog = await openRelated("Comunicações");
    expect(await within(dialog).findByText("Sem comunicações")).toBeVisible();
  });
});
