import type { AdminUser, UserSummary } from "@crm/contracts";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthorizationContext,
  type Authorization,
} from "../../authorization-context";
import { jsonResponse } from "../../test-support/http";
import { ResetPasswordModal } from "./ResetPasswordModal";

const target = {
  id: "33333333-3333-4333-8333-333333333333",
  fullName: "Maria Souza",
  email: "maria@teste.local",
  role: "user",
  modules: [],
  editModules: [],
  permissions: [],
  active: true,
} as unknown as AdminUser;

function session(role: UserSummary["role"]): Authorization {
  return {
    user: {
      id: "22222222-2222-4222-8222-222222222222",
      fullName: "Aryana Dutra",
      email: "admin@movimenta.local",
      role,
      modules: [],
      editModules: [],
      permissions: [],
    },
    checking: false,
    setUser: () => undefined,
    logout: () => undefined,
    can: () => true,
    canView: () => true,
    canEdit: () => true,
  };
}

function renderModal(role: UserSummary["role"] = "admin") {
  const onDone = vi.fn();
  render(
    <AuthorizationContext.Provider value={session(role)}>
      <ResetPasswordModal user={target} onClose={vi.fn()} onDone={onDone} />
    </AuthorizationContext.Provider>,
  );
  return { onDone };
}

const revealCalls = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).endsWith("/reveal-password"));

describe("Senha de acesso", () => {
  beforeEach(() => {
    localStorage.setItem("crm.auth.token", "test-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  it("começa mascarada, consulta só ao clicar no olho e oculta sem nova consulta", async () => {
    let answer!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    renderModal();
    expect(
      screen.getByText("Consulte a senha atual ou defina uma nova senha."),
    ).toBeInTheDocument();
    expect(screen.getByText("••••••••")).toHaveAttribute("aria-hidden", "true");
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Mostrar senha atual" }),
    );
    const eye = screen.getByRole("button", { name: "Mostrar senha atual" });
    expect(eye).toBeDisabled();
    expect(eye).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Consultando senha...")).toBeInTheDocument();
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toContain(`/admin/users/${target.id}/reveal-password`);
    expect(init?.method).toBe("POST");

    await act(async () => answer(jsonResponse({ password: "Aa1" })));
    const shown = await screen.findByLabelText("Senha atual");
    expect(shown).toHaveValue("Aa1");
    expect(shown).toHaveAttribute("readonly");
    expect(shown).toHaveAttribute("type", "text");
    expect(shown).toHaveAttribute("autocomplete", "off");
    expect(
      screen.getByText("Senha exibida apenas para consulta."),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Ocultar senha atual" }),
    );
    expect(screen.queryByDisplayValue("Aa1")).not.toBeInTheDocument();
    expect(screen.getByText("••••••••")).toBeInTheDocument();
    expect(revealCalls()).toHaveLength(1);
  });

  it("mostra a mensagem do servidor quando a senha não está disponível (409)", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          code: "PASSWORD_NOT_AVAILABLE",
          message:
            "A senha atual não está disponível para visualização. Ela ficará disponível após uma nova troca de senha.",
        },
        409,
      ),
    );
    renderModal();
    fireEvent.click(
      screen.getByRole("button", { name: "Mostrar senha atual" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A senha atual não está disponível para visualização. Ela ficará disponível após uma nova troca de senha.",
    );
    expect(screen.getByText("••••••••")).toBeInTheDocument();
  });

  it("descarta a resposta de uma consulta ocultada antes de chegar", async () => {
    let answer!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    const { unmount } = render(
      <AuthorizationContext.Provider value={session("admin")}>
        <ResetPasswordModal user={target} onClose={vi.fn()} onDone={vi.fn()} />
      </AuthorizationContext.Provider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Mostrar senha atual" }),
    );
    unmount();
    await act(async () => answer(jsonResponse({ password: "Tarde1" })));
    expect(screen.queryByDisplayValue("Tarde1")).not.toBeInTheDocument();
  });

  it("não mostra o olho para quem não é admin", () => {
    renderModal("user");
    expect(
      screen.queryByRole("button", { name: "Mostrar senha atual" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("••••••••")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nova senha")).toBeInTheDocument();
  });

  it("define a nova senha com olho próprio e esconde a senha consultada ao salvar", async () => {
    let saved!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith("/reveal-password")
        ? jsonResponse({ password: "Aa1" })
        : new Promise<Response>((resolve) => {
            saved = resolve;
          }),
    );
    const { onDone } = renderModal();
    fireEvent.click(
      screen.getByRole("button", { name: "Mostrar senha atual" }),
    );
    expect(await screen.findByDisplayValue("Aa1")).toBeInTheDocument();

    const field = screen.getByLabelText("Nova senha");
    expect(field).toHaveAttribute("type", "password");
    expect(field).toHaveAttribute("autocomplete", "new-password");
    expect(field).toHaveAttribute("placeholder", "Digite a nova senha");
    fireEvent.change(field, { target: { value: "Bb2" } });
    expect(field.closest(".password-card")).toHaveClass("is-modified");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar nova senha" }));
    expect(field).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar nova senha" }));
    expect(field).toHaveAttribute("type", "password");

    fireEvent.submit(field.closest("form")!);
    // Ao salvar, o cartão remonta: a senha consultada some e o olho fica travado.
    await waitFor(() =>
      expect(screen.queryByDisplayValue("Aa1")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Mostrar senha atual" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await act(async () => saved(jsonResponse({ updated: true })));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const reset = vi
      .mocked(fetch)
      .mock.calls.find(([url]) => String(url).endsWith("/reset-password"))!;
    expect(JSON.parse(String(reset[1]?.body))).toEqual({ password: "Bb2" });
    expect(revealCalls()).toHaveLength(1);
  });
});
