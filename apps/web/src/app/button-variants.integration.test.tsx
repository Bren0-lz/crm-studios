import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import {
  legacyAccess,
  openSettingsSection,
  relationshipSettingsFixture,
  storedUser,
} from "../test-support/legacy-fixtures";
import "../test-support/legacy-setup";

describe("button variants", () => {
  const owner = {
    id: "22222222-2222-4222-8222-222222222222",
    fullName: "Aryana Dutra",
    email: "admin@movimenta.local",
    role: "owner",
  };
  const variants = [
    "primary-button",
    "secondary-button",
    "text-button",
    "danger-button",
    "icon-button",
    // Etiqueta verde que insere um código nos editores de mensagem.
    "variable-chip",
  ];

  /** Botões da página (fora da barra lateral e do topo) sem uma das variantes padronizadas. */
  function unstyledButtons(container: HTMLElement) {
    const page = container.querySelector(".page-content")!;
    return [...page.querySelectorAll("button")]
      .filter(
        (button) =>
          !variants.some((variant) => button.classList.contains(variant)),
      )
      .map(
        (button) =>
          button.textContent?.trim() ||
          button.getAttribute("aria-label") ||
          "(sem texto)",
      );
  }

  function mockApi(bodyFor: (url: string) => unknown, role = "owner") {
    localStorage.setItem("crm.auth.token", "test-token");
    localStorage.setItem("crm.auth.user", storedUser({ ...owner, role }));
    vi.mocked(fetch).mockImplementation(async (input) => {
      const body = bodyFor(String(input));
      return {
        ok: true,
        status: 200,
        json: async () => body ?? [],
      } as Response;
    });
  }

  it("uses a button variant on every button of the dashboard", async () => {
    const birthday = {
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      phone: "11987654321",
      reason: "birthday",
      referenceKey: "99999999-9999-4999-8999-999999999999:2026",
      detail: "Aniversário hoje",
      dueDate: "2026-10-10",
      priority: 1,
    };
    const appointment = {
      id: "a1",
      patientName: "Bruno Souza",
      serviceName: "Pilates",
      professionalName: "Carla",
      professionalColor: "#26705f",
      startsAt: "2026-10-04T13:00:00.000Z",
      endsAt: "2026-10-04T14:00:00.000Z",
      status: "scheduled",
    };
    mockApi(
      (url) =>
        url.includes("/relationship/suggestions")
          ? [birthday]
          : url.includes("/relationship/settings")
            ? relationshipSettingsFixture()
            : url.includes("/dashboard")
              ? {
                  appointmentsToday: 1,
                  completedToday: 0,
                  patientsActive: 3,
                  noShowsThisMonth: 0,
                  nextAppointments: [appointment],
                }
              : undefined,
      "reception",
    );
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    const card = (
      await screen.findByRole("heading", { name: "Aniversariantes" })
    ).closest("section")!;
    const helena = (await within(card).findByText("Helena Almeida")).closest(
      ".attention-item",
    ) as HTMLElement;
    const congratulate = within(helena).getByRole("link", {
      name: /Dar parabéns/,
    });
    expect(congratulate).toHaveClass("whatsapp-button", "button-sm");
    expect(
      within(helena).getByRole("button", { name: "Marcar como enviado" }),
    ).toHaveClass("secondary-button", "button-sm");
    // Sem a divisória do cartão de plano acima das ações de aniversário.
    expect(congratulate.parentElement).toHaveClass("birthday-actions");
    expect(congratulate.parentElement).not.toHaveClass("plan-actions");
    await screen.findByText("Bruno Souza");
    expect(unstyledButtons(container)).toEqual([]);
  });

  it("uses a button variant on every button of the settings page", async () => {
    const user = {
      id: "33333333-3333-4333-8333-333333333333",
      clinicId: "11111111-1111-4111-8111-111111111111",
      fullName: "Maria Souza",
      email: "maria@movimenta.local",
      ...legacyAccess("reception"),
      customModules: false,
      active: true,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    const holiday = {
      id: "h1",
      clinicId: "11111111-1111-4111-8111-111111111111",
      name: "Dia da cidade",
      date: "2026-11-20",
      createdAt: "2026-09-01T12:00:00.000Z",
    };
    mockApi((url) =>
      url.includes("/admin/users")
        ? [user]
        : url.includes("/admin/permission-matrix")
          ? []
          : url.includes("/relationship/settings")
            ? relationshipSettingsFixture()
            : url.includes("/admin/clinic-settings")
              ? {
                  id: "c1",
                  name: "Studios Aryana",
                  legalName: "",
                  taxId: "",
                  phone: "",
                  email: "",
                  address: "",
                  timezone: "America/Sao_Paulo",
                  updatedAt: "2026-09-01T12:00:00.000Z",
                }
              : url.includes("/holidays")
                ? [holiday]
                : undefined,
    );
    const { container } = render(
      <MemoryRouter initialEntries={["/configuracoes"]}>
        <App />
      </MemoryRouter>,
    );
    await openSettingsSection(
      "Dados da clínica",
      "Prazos e mensagens",
      "Feriados",
    );
    const section = await openSettingsSection("Usuários");
    await within(section).findByText("Maria Souza");
    expect(
      within(section).getByRole("button", { name: "Redefinir senha" }),
    ).toHaveClass("secondary-button", "button-sm");
    expect(
      within(section).getByRole("button", { name: "Desativar" }),
    ).toHaveClass("danger-button", "button-sm");
    await openSettingsSection("Feriados");
    expect(
      await screen.findByRole("button", {
        name: "Excluir feriado Dia da cidade",
      }),
    ).toHaveClass("danger-button", "button-sm");
    // Salvar dos formulários de configuração: tamanho normal, no rodapé alinhado à direita (não estica no grid).
    for (const name of ["Salvar configurações", "Salvar prazos e mensagens"]) {
      await openSettingsSection(
        name === "Salvar configurações"
          ? "Dados da clínica"
          : "Prazos e mensagens",
      );
      const save = await screen.findByRole("button", { name });
      expect(save).toHaveClass("primary-button");
      expect(save.parentElement).toHaveClass("modal-actions");
    }
    expect(unstyledButtons(container)).toEqual([]);
  });

  it("uses a button variant on every button of the plans page", async () => {
    const plan = {
      services: [
        {
          serviceId: "77777777-7777-4777-8777-777777777777",
          totalSessions: 8,
          totalValueInCents: 40000,
          remainingSessions: 2,
          serviceName: "Pilates",
        },
      ],
      id: "55555555-5555-4555-8555-555555555555",
      clinicId: "11111111-1111-4111-8111-111111111111",
      patientId: "99999999-9999-4999-8999-999999999999",
      patientName: "Helena Almeida",
      serviceId: "77777777-7777-4777-8777-777777777777",
      serviceName: "Pilates",
      name: "Mensalidade Pilates",
      kind: "recurring",
      totalSessions: 8,
      remainingSessions: 2,
      validFrom: "2026-09-01",
      validUntil: "2026-09-30",
      totalValueInCents: 40000,
      installments: 1,
      firstDueDate: "2026-09-05",
      status: "active",
      autoRenew: true,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
    };
    mockApi((url) => (url.includes("/plans") ? [plan] : undefined));
    const { container } = render(
      <MemoryRouter initialEntries={["/planos"]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "Renovar" })).toHaveClass(
      "secondary-button",
      "button-sm",
    );
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveClass(
      "danger-button",
      "button-sm",
    );
    expect(unstyledButtons(container)).toEqual([]);
  });
});
