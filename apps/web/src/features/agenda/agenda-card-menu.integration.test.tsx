import type { Appointment, AppointmentStatus } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../../App";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { AgendaCard } from "./AgendaCard";
import { AppointmentDetailsModal } from "./AppointmentDetailsModal";

function authorization(denied: string[] = []): Authorization {
  return {
    user: null,
    checking: false,
    setUser: () => undefined,
    logout: () => undefined,
    can: (permission) => !denied.includes(permission),
    canView: () => true,
    canEdit: () => true,
  };
}

const appointment: Appointment = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  patientId: "11111111-1111-4111-8111-111111111111",
  professionalId: "22222222-2222-4222-8222-222222222222",
  roomId: "33333333-3333-4333-8333-333333333333",
  serviceId: "44444444-4444-4444-8444-444444444444",
  startsAt: "2031-10-12T13:00:00.000Z",
  endsAt: "2031-10-12T14:00:00.000Z",
  visitType: "regular",
  status: "scheduled",
  patientName: "Ana Gomes",
  professionalName: "Dra. Ana Martins",
  professionalColor: "#2f7d6d",
  roomName: "Sala 1",
  serviceName: "Pilates",
  createdAt: "2031-10-01T12:00:00.000Z",
  updatedAt: "2031-10-01T12:00:00.000Z",
};

function mountCard(
  options: {
    status?: AppointmentStatus;
    denied?: string[];
    editable?: boolean;
  } = {},
) {
  const callbacks = {
    onOpen: vi.fn(),
    onEdit: vi.fn(),
    onReschedule: vi.fn(),
    onHistory: vi.fn(),
    onCancel: vi.fn(),
  };
  const editable = options.editable ?? true;
  render(
    <AuthorizationContext.Provider value={authorization(options.denied)}>
      <AgendaCard
        appointment={{ ...appointment, status: options.status ?? "scheduled" }}
        onOpen={callbacks.onOpen}
        onStatus={editable ? () => undefined : undefined}
        onHistory={callbacks.onHistory}
        onEdit={editable ? callbacks.onEdit : undefined}
        onReschedule={editable ? callbacks.onReschedule : undefined}
        onCancel={editable ? callbacks.onCancel : undefined}
      />
    </AuthorizationContext.Provider>,
  );
  return callbacks;
}

function openMenu() {
  const button = screen.getByRole("button", {
    name: /^Mais ações do atendimento de ./,
  });
  expect(button).toHaveAttribute("aria-haspopup", "menu");
  expect(button).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(button);
  expect(button).toHaveAttribute("aria-expanded", "true");
  return screen.getByRole("menu", { name: /^Mais ações do atendimento de ./ });
}

function itemNames(menu: HTMLElement) {
  return within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
}

describe("menu ⋯ do atendimento na agenda (QM7)", () => {
  it("abre um menu com Editar, Remarcar, Histórico e Cancelar", () => {
    const callbacks = mountCard();
    expect(itemNames(openMenu())).toEqual([
      "Editar",
      "Remarcar",
      "Histórico",
      "Cancelar",
    ]);
    // Abrir o menu não abre o histórico nem os detalhes.
    expect(callbacks.onHistory).not.toHaveBeenCalled();
    expect(callbacks.onOpen).not.toHaveBeenCalled();
  });

  it.each([
    ["Editar", "onEdit"],
    ["Remarcar", "onReschedule"],
    ["Histórico", "onHistory"],
    ["Cancelar", "onCancel"],
  ] as const)("a opção %s abre o fluxo certo", (label, callback) => {
    const callbacks = mountCard();
    fireEvent.click(within(openMenu()).getByRole("menuitem", { name: label }));
    expect(callbacks[callback]).toHaveBeenCalledTimes(1);
    for (const [name, fn] of Object.entries(callbacks))
      if (name !== callback) expect(fn).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("em status final só oferece o histórico", () => {
    mountCard({ status: "completed" });
    expect(itemNames(openMenu())).toEqual(["Histórico"]);
  });

  it("esconde as opções sem permissão", () => {
    mountCard({ denied: ["agenda.reschedule", "agenda.cancel"] });
    expect(itemNames(openMenu())).toEqual(["Histórico"]);
  });

  it("na agenda só de consulta mostra apenas o histórico", () => {
    mountCard({ editable: false });
    expect(itemNames(openMenu())).toEqual(["Histórico"]);
  });

  it("Esc fecha o menu e devolve o foco ao botão", () => {
    mountCard();
    const menu = openMenu();
    fireEvent.keyDown(within(menu).getAllByRole("menuitem")[0]!, {
      key: "Escape",
    });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Mais ações do atendimento de ./ }),
    ).toHaveFocus();
  });
});

describe("detalhes abertos direto na edição (QM7)", () => {
  it("abre o Editar e, ao voltar, fecha tudo", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <AuthorizationContext.Provider value={authorization()}>
          <AppointmentDetailsModal
            appointment={appointment}
            patient={undefined}
            service={undefined}
            editable
            initialEditing
            onClose={onClose}
            onReschedule={() => undefined}
            onUpdated={() => undefined}
            onEdited={() => undefined}
          />
        </AuthorizationContext.Provider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("dialog", { name: /Editar atendimento/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("menu ⋯ na página da agenda (QM7)", () => {
  function renderAgenda(shown: Appointment) {
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
    localStorage.setItem("crm.agenda.view", "day");
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = new URL(String(input), "http://localhost");
      let body: unknown = [];
      if (url.pathname.endsWith("/appointments")) body = [shown];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    return render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
  }

  function today(): Appointment {
    const start = new Date();
    start.setHours(10, 0, 0, 0);
    return {
      ...appointment,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
    };
  }

  async function choose(label: string) {
    fireEvent.click(
      await screen.findByRole("button", {
        name: /^Mais ações do atendimento de ./,
      }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
  }

  it("Editar abre a edição do atendimento", async () => {
    renderAgenda(today());
    await choose("Editar");
    expect(
      await screen.findByRole("dialog", { name: /Editar atendimento/ }),
    ).toBeInTheDocument();
  });

  it("Remarcar abre a remarcação", async () => {
    renderAgenda(today());
    await choose("Remarcar");
    expect(
      await screen.findByRole("dialog", { name: /Reagendar atendimento/ }),
    ).toBeInTheDocument();
  });

  it("Histórico abre o histórico de reagendamentos", async () => {
    renderAgenda(today());
    await choose("Histórico");
    expect(
      await screen.findByRole("dialog", {
        name: /Histórico de reagendamentos/,
      }),
    ).toBeInTheDocument();
  });

  it("Cancelar abre a confirmação com motivo", async () => {
    renderAgenda(today());
    await choose("Cancelar");
    const dialog = await screen.findByRole("dialog", {
      name: /Detalhes do atendimento/,
    });
    expect(
      within(dialog).getByLabelText("Motivo do cancelamento"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Confirmar cancelamento" }),
    ).toBeDisabled();
  });
});
