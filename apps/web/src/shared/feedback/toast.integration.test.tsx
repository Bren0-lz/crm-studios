import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../../App";
import { storedUser } from "../../test-support/legacy-fixtures";
import "../../test-support/legacy-setup";
import { ToastProvider } from "./ToastProvider";
import { useToast } from "./toast-context";

const shellCss = readFileSync(
  `${process.cwd()}/src/styles/03-shell.css`,
  "utf8",
);
const modalsCss = readFileSync(
  `${process.cwd()}/src/styles/06-modals.css`,
  "utf8",
);

function cssZIndex(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(css)?.[1];
  const match = /z-index:\s*(\d+)/.exec(rule ?? "");
  return match ? Number(match[1]) : NaN;
}

function Trigger() {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast.success("Salvo com sucesso.")}>ok</button>
      <button onClick={() => toast.error("Falhou.")}>erro</button>
    </>
  );
}

afterEach(() => vi.useRealTimers());

describe("toasts", () => {
  it("shows success and error messages, closes on click and after a while", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "ok" }));
    fireEvent.click(screen.getByRole("button", { name: "erro" }));
    expect(screen.getByRole("status")).toHaveTextContent("Salvo com sucesso.");
    expect(screen.getByRole("alert")).toHaveTextContent("Falhou.");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Fechar aviso" })[1]!,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4100));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("confirms an appointment in the agenda with a toast", async () => {
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
    const startsAt = new Date();
    startsAt.setHours(10, 0, 0, 0);
    const appointment = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      patientName: "Helena Almeida",
      professionalColor: "#5c6f68",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 50 * 60_000).toISOString(),
      serviceName: "Pilates",
      professionalName: "Dra. Ana Martins",
      roomName: "Sala Movimento",
      status: "scheduled",
    };
    vi.mocked(fetch).mockImplementation(
      async (input, options) =>
        ({
          ok: true,
          status: 200,
          json: async () =>
            options?.method === "PATCH"
              ? { ...appointment, status: "confirmed" }
              : String(input).includes("/appointments?")
                ? [appointment]
                : [],
        }) as Response,
    );
    render(
      <MemoryRouter initialEntries={["/agenda"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Status do atendimento" }),
      { target: { value: "confirmed" } },
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Presença confirmada.",
    );
  });

  it("stacks above open modals so toasts from in-modal actions stay visible", () => {
    const toastZ = cssZIndex(shellCss, ".toast-stack");
    const modalZ = cssZIndex(modalsCss, ".modal-backdrop");
    expect(toastZ).toBeGreaterThan(modalZ);
  });
});
