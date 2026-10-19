import type { Appointment, Room, Service } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { jsonResponse } from "../../test-support/http";
import "../../test-support/legacy-setup";
import { AppointmentDetailsModal } from "./AppointmentDetailsModal";

const allowAll: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};
const carolina = "22222222-2222-4222-8222-222222222222";
const beatriz = "55555555-5555-4555-8555-555555555555";
const pilatesRoom = "33333333-3333-4333-8333-333333333333";
const aestheticsRoom = "66666666-6666-4666-8666-666666666666";
const pilates = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Pilates",
  durationMinutes: 60,
  priceInCents: 9000,
  color: "#547A6B",
  professionalIds: [],
  roomIds: [],
} as unknown as Service;
const depilation = {
  id: "77777777-7777-4777-8777-777777777777",
  name: "Depilação pernas",
  durationMinutes: 45,
  priceInCents: 12000,
  color: "#db8290",
  professionalIds: [carolina],
  roomIds: [aestheticsRoom],
} as unknown as Service;
const massage = {
  id: "88888888-8888-4888-8888-888888888888",
  name: "Massagem",
  durationMinutes: 50,
  priceInCents: 10000,
  color: "#db8290",
  professionalIds: [beatriz],
  roomIds: [],
} as unknown as Service;
const rooms = [
  { id: pilatesRoom, name: "Sala Pilates", capacity: 1 },
  { id: aestheticsRoom, name: "Sala Estética", capacity: 1 },
] as Room[];

const appointment: Appointment = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  patientId: "11111111-1111-4111-8111-111111111111",
  professionalId: carolina,
  roomId: pilatesRoom,
  serviceId: pilates.id,
  startsAt: "2031-10-12T13:00:00.000Z",
  endsAt: "2031-10-12T14:00:00.000Z",
  visitType: "regular",
  status: "scheduled",
  notes: "Trazer exames",
  patientName: "Ana Gomes",
  professionalName: "Carolina Rocha",
  professionalColor: "#2f7d6d",
  roomName: "Sala Pilates",
  serviceName: "Pilates",
  createdAt: "2031-10-01T12:00:00.000Z",
  updatedAt: "2031-10-01T12:00:00.000Z",
};

function mount(
  props: {
    onEdited?: (updated: Appointment) => void;
    authorization?: Authorization;
    shown?: Appointment;
  } = {},
) {
  return render(
    <MemoryRouter>
      <AuthorizationContext.Provider value={props.authorization ?? allowAll}>
        <AppointmentDetailsModal
          appointment={props.shown ?? appointment}
          patient={undefined}
          service={pilates}
          editable
          onClose={() => undefined}
          onReschedule={() => undefined}
          onUpdated={() => undefined}
          onEdited={props.onEdited ?? (() => undefined)}
        />
      </AuthorizationContext.Provider>
    </MemoryRouter>,
  );
}

function mockApi(saved: Appointment) {
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    const url = new URL(String(input), "http://localhost");
    if (init?.method === "PATCH") return jsonResponse(saved);
    if (url.pathname.endsWith("/services"))
      return jsonResponse([pilates, depilation, massage]);
    if (url.pathname.endsWith("/rooms")) return jsonResponse(rooms);
    return jsonResponse([]);
  });
}

describe("appointment details footer and edit (QM6)", () => {
  it("keeps every action in a sticky footer with the destructive one on the left", () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    mount();
    const dialog = screen.getByRole("dialog");
    const details = dialog.querySelector<HTMLElement>(".appointment-details")!;
    const footer = details.lastElementChild as HTMLElement;
    // Último bloco do corpo: o `position: sticky` o mantém visível sem rolar.
    expect(footer).toHaveClass("appointment-detail-footer");
    const groups = footer.querySelector<HTMLElement>(".tab-footer")!.children;
    expect(groups[0]).toHaveClass("tab-footer-danger");
    expect(groups[1]).toHaveClass("tab-footer-main");
    expect(
      within(groups[0] as HTMLElement).getByRole("button", {
        name: "Cancelar atendimento",
      }),
    ).toHaveClass("danger-button");
    const main = within(groups[1] as HTMLElement);
    for (const name of [
      "Editar",
      "Remarcar atendimento",
      "Confirmar presença",
      "Marcar falta",
      "Marcar como realizado",
    ])
      expect(main.getByRole("button", { name })).toBeInTheDocument();

    const css = readFileSync(
      `${process.cwd()}/src/styles/05-agenda.css`,
      "utf8",
    );
    const rule = /\.appointment-detail-footer\s*\{([^}]*)\}/.exec(css)?.[1];
    expect(rule).toMatch(/position:\s*sticky/);
    expect(rule).toMatch(/bottom:/);

    // A confirmação de cancelamento ocupa o rodapé, também sem rolar.
    fireEvent.click(
      within(groups[0] as HTMLElement).getByRole("button", {
        name: "Cancelar atendimento",
      }),
    );
    expect(
      within(footer).getByText("Cancelar este atendimento?"),
    ).toBeInTheDocument();
    expect(
      within(footer).queryByRole("button", { name: "Editar" }),
    ).not.toBeInTheDocument();
  });

  it("hides Editar without the reschedule permission and on finished appointments", () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    const { unmount } = mount({
      authorization: {
        ...allowAll,
        can: (key) => key !== "agenda.reschedule",
      },
    });
    expect(
      screen.queryByRole("button", { name: "Editar" }),
    ).not.toBeInTheDocument();
    unmount();
    mount({ shown: { ...appointment, status: "completed" } });
    expect(
      screen.queryByRole("button", { name: "Editar" }),
    ).not.toBeInTheDocument();
  });

  it("edits service, room and note offering only what the professional and service allow", async () => {
    const saved: Appointment = {
      ...appointment,
      serviceId: depilation.id,
      serviceName: depilation.name,
      roomId: aestheticsRoom,
      roomName: "Sala Estética",
      notes: "Chegar 10 min antes",
      endsAt: "2031-10-12T13:45:00.000Z",
    };
    mockApi(saved);
    const onEdited = vi.fn();
    mount({ onEdited });
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Editar atendimento",
    });
    const service = await within(dialog).findByLabelText("Serviço");
    expect(service).toHaveValue(pilates.id);
    // Massagem é só da Beatriz: não aparece para a Carolina.
    expect(
      within(service).queryByRole("option", { name: "Massagem" }),
    ).not.toBeInTheDocument();
    // Data, horário e profissional ficam com a remarcação.
    expect(within(dialog).queryByLabelText("Profissional")).toBeNull();

    fireEvent.change(service, { target: { value: depilation.id } });
    const room = within(dialog).getByLabelText("Sala");
    // Depilação só na Sala Estética: a sala troca sozinha e a outra some.
    expect(room).toHaveValue(aestheticsRoom);
    expect(
      within(room).queryByRole("option", { name: "Sala Pilates" }),
    ).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Observação"), {
      target: { value: "Chegar 10 min antes" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar alterações" }),
    );

    await vi.waitFor(() => expect(onEdited).toHaveBeenCalledWith(saved));
    const call = vi
      .mocked(fetch)
      .mock.calls.find(([, options]) => options?.method === "PATCH");
    expect(String(call?.[0])).toMatch(/\/appointments\/aaaaaaaa-[^/]+$/);
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      serviceId: depilation.id,
      roomId: aestheticsRoom,
      notes: "Chegar 10 min antes",
    });
    // Volta aos detalhes depois de salvar.
    expect(
      await screen.findByRole("dialog", { name: "Detalhes do atendimento" }),
    ).toBeInTheDocument();
  });

  it("locks the form while saving and shows the API error", async () => {
    let reject: (error: Response) => void = () => undefined;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      if (init?.method === "PATCH")
        return new Promise<Response>((_, fail) => {
          reject = fail;
        }).catch(() =>
          jsonResponse(
            {
              code: "APPOINTMENT_CONFLICT",
              message:
                "O profissional ou a sala está ocupado ou bloqueado nesse horário.",
            },
            409,
          ),
        );
      if (url.pathname.endsWith("/services"))
        return jsonResponse([pilates, depilation]);
      if (url.pathname.endsWith("/rooms")) return jsonResponse(rooms);
      return jsonResponse([]);
    });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Editar atendimento",
    });
    await within(dialog).findByLabelText("Serviço");
    fireEvent.change(within(dialog).getByLabelText("Sala"), {
      target: { value: aestheticsRoom },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Salvar alterações" }),
    );
    expect(
      await within(dialog).findByRole("button", { name: "Salvando…" }),
    ).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Voltar" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Fechar" })).toBeDisabled();
    reject(new Response());
    expect(
      await within(dialog).findByText(
        "O profissional ou a sala está ocupado ou bloqueado nesse horário.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Voltar" }),
    ).toBeEnabled();
  });
});
