import type { Appointment, Professional, Room, Service } from "@crm/contracts";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { jsonResponse } from "../../test-support/http";
import {
  appointmentPricingWithPlan,
  fixturePlanId,
} from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { AppointmentEditModal } from "./AppointmentEditModal";
import { AppointmentRescheduleModal } from "./AppointmentRescheduleModal";

/** Edição e remarcação mostram o plano do atendimento (AP4). */
const allowAll: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};
const professional = {
  id: "22222222-2222-4222-8222-222222222222",
  fullName: "Carolina Rocha",
  color: "#2f7d6d",
} as Professional;
const room = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Sala",
} as Room;
const service = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Pilates",
  durationMinutes: 60,
  professionalIds: [],
  roomIds: [],
} as unknown as Service;
const base: Appointment = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  patientId: "11111111-1111-4111-8111-111111111111",
  professionalId: professional.id,
  roomId: room.id,
  serviceId: service.id,
  startsAt: "2031-10-12T13:00:00.000Z",
  endsAt: "2031-10-12T14:00:00.000Z",
  visitType: "regular",
  status: "scheduled",
  notes: "",
  patientName: "Ana Gomes",
  professionalName: professional.fullName,
  professionalColor: "#2f7d6d",
  roomName: room.name,
  serviceName: service.name,
  createdAt: "2031-10-01T12:00:00.000Z",
  updatedAt: "2031-10-01T12:00:00.000Z",
};

function mockApi() {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const pricing = appointmentPricingWithPlan(String(input));
    if (pricing) return pricing;
    if (init?.method) return jsonResponse(base);
    const url = String(input);
    if (url.includes("/services")) return jsonResponse([service]);
    if (url.includes("/rooms")) return jsonResponse([room]);
    return jsonResponse([]);
  });
}

function sent(method: string) {
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([, options]) => options?.method === method);
  return JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
}

function wrap(children: React.ReactNode) {
  return render(
    <MemoryRouter>
      <AuthorizationContext.Provider value={allowAll}>
        {children}
      </AuthorizationContext.Provider>
    </MemoryRouter>,
  );
}

function reschedule(appointment: Appointment, onSaved = vi.fn()) {
  wrap(
    <AppointmentRescheduleModal
      appointment={appointment}
      service={service}
      professionals={[professional]}
      rooms={[room]}
      onClose={() => undefined}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

describe("plano na edição e na remarcação (AP4)", () => {
  it("edição mostra o plano vinculado e mantém sem vínculo o agendado antes da exigência", async () => {
    mockApi();
    const onSaved = vi.fn();
    wrap(
      <AppointmentEditModal
        appointment={base}
        onClose={() => undefined}
        onSaved={onSaved}
      />,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Editar atendimento",
    });
    const plan = await within(dialog).findByLabelText("Plano");
    expect(plan).toHaveValue("");
    expect(
      within(plan).getByRole("option", { name: "Sem plano vinculado" }),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Observação"), {
      target: { value: "Só a observação" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar alterações" }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sent("PATCH")).not.toHaveProperty("planId");
  });

  it("edição de atendimento com plano mostra o plano escolhido", async () => {
    mockApi();
    wrap(
      <AppointmentEditModal
        appointment={{ ...base, planId: fixturePlanId }}
        onClose={() => undefined}
        onSaved={() => undefined}
      />,
    );
    const plan = await screen.findByLabelText("Plano");
    expect(plan).toHaveValue(fixturePlanId);
    expect(
      within(plan).queryByRole("option", { name: "Sem plano vinculado" }),
    ).not.toBeInTheDocument();
  });

  it("remarcação confere o plano na nova data e o envia", async () => {
    mockApi();
    const onSaved = reschedule({ ...base, planId: fixturePlanId });
    const dialog = await screen.findByRole("dialog", {
      name: "Reagendar atendimento",
    });
    expect(await within(dialog).findByLabelText("Plano")).toHaveValue(
      fixturePlanId,
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar reagendamento" }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sent("PUT")).toMatchObject({ planId: fixturePlanId });
  });

  it("remarcar agendado sem plano (anterior à exigência) segue sem vínculo", async () => {
    mockApi();
    const onSaved = reschedule(base);
    const dialog = await screen.findByRole("dialog", {
      name: "Reagendar atendimento",
    });
    expect(await within(dialog).findByLabelText("Plano")).toHaveValue("");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar reagendamento" }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sent("PUT")).not.toHaveProperty("planId");
  });

  it("reposição de ausência sem plano escolhe o plano do cliente", async () => {
    mockApi();
    const onSaved = reschedule({ ...base, status: "excused_absence" });
    const dialog = await screen.findByRole("dialog", {
      name: "Reagendar atendimento",
    });
    const plan = await within(dialog).findByLabelText("Plano");
    await waitFor(() => expect(plan).toHaveValue(fixturePlanId));
    expect(
      within(plan).queryByRole("option", { name: "Sem plano vinculado" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", {
          name: "Confirmar reagendamento",
        }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar reagendamento" }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sent("POST")).toMatchObject({ planId: fixturePlanId });
  });
});
