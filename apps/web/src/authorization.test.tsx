import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AuthorizationProvider } from "./authorization";
import { useAuthorization } from "./authorization-context";
import { api, storeUser } from "./api";
import type { UserSummary } from "@crm/contracts";

const user: UserSummary = {
  id: "user-id",
  fullName: "Equipe",
  email: "team@test.local",
  role: "user",
  modules: ["finance"],
  editModules: [],
  permissions: ["finance.view", "finance.receive"],
};
function Probe() {
  const { checking, user, can, logout } = useAuthorization();
  if (checking) return <span>Verificando sessão</span>;
  return (
    <>
      <span>{user ? "Autenticado" : "Desconectado"}</span>
      {can("finance.receive") && <button>Receber</button>}
      {can("finance.receivables_reverse") && <button>Estornar</button>}
      <button onClick={logout}>Sair</button>
    </>
  );
}
function mount() {
  localStorage.setItem("crm.auth.token", "same-token");
  storeUser(user);
  return render(
    <AuthorizationProvider>
      <Probe />
    </AuthorizationProvider>,
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
describe("react authorization state", () => {
  it("waits for /me and enables receiving independently of reversal", async () => {
    let resolve!: (value: UserSummary) => void;
    vi.spyOn(api, "me").mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mount();
    expect(screen.getByText("Verificando sessão")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Receber" }),
    ).not.toBeInTheDocument();
    resolve(user);
    expect(
      await screen.findByRole("button", { name: "Receber" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Estornar" }),
    ).not.toBeInTheDocument();
  });
  it("refreshes on focus and removes revoked operations without changing the token", async () => {
    const me = vi.spyOn(api, "me").mockResolvedValue(user);
    mount();
    await screen.findByRole("button", { name: "Receber" });
    me.mockResolvedValue({ ...user, modules: [], permissions: [] });
    fireEvent(window, new Event("focus"));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Receber" }),
      ).not.toBeInTheDocument(),
    );
    expect(localStorage.getItem("crm.auth.token")).toBe("same-token");
  });
  it("deduplicates permission-denied refreshes", async () => {
    const me = vi.spyOn(api, "me").mockResolvedValue(user);
    mount();
    await screen.findByRole("button", { name: "Receber" });
    let resolve!: (value: UserSummary) => void;
    me.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    fireEvent(window, new Event("crm:access-denied"));
    fireEvent(window, new Event("crm:access-denied"));
    expect(me).toHaveBeenCalledTimes(2);
    resolve({ ...user, modules: [], permissions: [] });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Receber" }),
      ).not.toBeInTheDocument(),
    );
  });
  it("does not resurrect a session when an old refresh finishes after logout", async () => {
    const me = vi.spyOn(api, "me").mockResolvedValue(user);
    mount();
    await screen.findByRole("button", { name: "Receber" });
    let resolve!: (value: UserSummary) => void;
    me.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    fireEvent(window, new Event("focus"));
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));
    resolve(user);
    await screen.findByText("Desconectado");
    expect(localStorage.getItem("crm.auth.token")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Receber" }),
    ).not.toBeInTheDocument();
  });
});
