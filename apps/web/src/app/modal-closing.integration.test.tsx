import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import App, { Modal } from "../App";
import { AppointmentDateTimePicker } from "../AppointmentDateTimePicker";
import { storedUser } from "../test-support/legacy-fixtures";
import "../test-support/legacy-setup";

describe("modal closing", () => {
  it("keeps the floating calendar in the modal focus boundary and consumes its first Escape", async () => {
    const onClose = vi.fn();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as Response);
    function CalendarModal() {
      const [value, setValue] = useState("2026-10-07T09:00");
      return (
        <Modal title="Agendamento" subtitle="Escolha a data" onClose={onClose}>
          <form>
            <AppointmentDateTimePicker
              value={value}
              onChange={setValue}
              professionalId=""
              roomId=""
            />
            <button type="button">Salvar atendimento</button>
          </form>
        </Modal>
      );
    }
    render(<CalendarModal />);
    const dialog = screen.getByRole("dialog", { name: "Agendamento" });
    const date = within(dialog).getByRole("button", { name: "Data" });
    fireEvent.click(date);
    await within(dialog).findByText("Nenhum compromisso registrado.");
    const panel = within(dialog).getByRole("region", {
      name: "Calendário de agendamento",
    });
    expect(dialog).toContainElement(panel);
    expect(panel.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(date).toHaveFocus();
    expect(within(dialog).queryByRole("region")).not.toBeInTheDocument();
    fireEvent.keyDown(date, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  function StackedModals({ busy = false }: { busy?: boolean }) {
    const [first, setFirst] = useState(false);
    const [second, setSecond] = useState(false);
    return (
      <>
        <button onClick={() => setFirst(true)}>Abrir primeiro</button>
        {first && (
          <Modal
            title="Primeiro"
            subtitle="Modal de baixo"
            onClose={() => setFirst(false)}
          >
            <button onClick={() => setSecond(true)}>Abrir segundo</button>
          </Modal>
        )}
        {second && (
          <Modal
            title="Segundo"
            subtitle="Modal de cima"
            busy={busy}
            onClose={() => setSecond(false)}
          >
            <p>Conteúdo do segundo</p>
          </Modal>
        )}
      </>
    );
  }

  it("does not close a modal when the backdrop is clicked", () => {
    render(<StackedModals />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir primeiro" }));
    const backdrop = document.querySelector(".modal-backdrop")!;
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(
      screen.getByRole("dialog", { name: "Primeiro" }),
    ).toBeInTheDocument();
  });

  it("closes only the top modal with Esc", () => {
    render(<StackedModals />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir primeiro" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir segundo" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Segundo" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Primeiro" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disables the close button and ignores Esc while the modal is busy", () => {
    render(<StackedModals busy />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir primeiro" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir segundo" }));
    const top = screen.getByRole("dialog", { name: "Segundo" });
    expect(within(top).getByRole("button", { name: "Fechar" })).toBeDisabled();
    fireEvent.keyDown(window, { key: "Escape" });
    // O de cima está salvando: Esc não fecha ele nem o de baixo.
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
  });

  it("keeps the wide group modal open on backdrop click and closes it with Esc", async () => {
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
      const body = String(input).includes("/groups/workspace?")
        ? {
            groups: [],
            enrollments: [],
            sessions: [],
            attendance: [],
            replacementCredits: [],
          }
        : [];
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    render(
      <MemoryRouter initialEntries={["/turmas"]}>
        <App />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Nova turma" }));
    const backdrop = document.querySelector(".modal-backdrop")!;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    const dialog = screen.getByRole("dialog", { name: "Nova turma" });
    expect(dialog).toHaveClass("modal-wide");
    expect(
      within(dialog).getByRole("heading", { name: "Dados da turma" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "Horários semanais" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("heading", { name: "Resumo da turma" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Serviço")).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Nova turma" }),
    ).not.toBeInTheDocument();
  });
});
