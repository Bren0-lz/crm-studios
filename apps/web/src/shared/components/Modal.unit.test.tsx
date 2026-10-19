import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useConfirmDiscard,
  useModalDirty,
} from "../workflows/ModalGuardContext";
import { useFormDirty } from "../workflows/useDirtyGuard";
import { Modal, ModalCancelButton } from "./Modal";

afterEach(cleanup);

function NameForm({
  onClose,
  busy = false,
}: {
  onClose: () => void;
  busy?: boolean;
}) {
  const [name, setName] = useState("Ana");
  const dirty = useFormDirty(name);
  return (
    <Modal
      title="Editar nome"
      subtitle="Teste"
      busy={busy}
      dirty={dirty}
      onClose={onClose}
    >
      <label>
        Nome
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <ModalCancelButton>Cancelar</ModalCancelButton>
    </Modal>
  );
}

function discardDialog() {
  return screen.getByRole("dialog", { name: "Descartar alterações?" });
}

describe("Modal com formulário alterado", () => {
  it("fecha direto quando o formulário está intacto (Esc, X e Cancelar)", () => {
    for (const close of [
      () => fireEvent.keyDown(window, { key: "Escape" }),
      () => fireEvent.click(screen.getByRole("button", { name: "Fechar" })),
      () => fireEvent.click(screen.getByRole("button", { name: "Cancelar" })),
    ]) {
      const onClose = vi.fn();
      render(<NameForm onClose={onClose} />);
      close();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(
        screen.queryByRole("dialog", { name: "Descartar alterações?" }),
      ).not.toBeInTheDocument();
      cleanup();
    }
  });

  it("pergunta antes de fechar por Esc, X ou Cancelar e só descarta ao confirmar", () => {
    const onClose = vi.fn();
    render(<NameForm onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Beatriz" },
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(discardDialog()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // Esc com a pergunta aberta fecha só a pergunta.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Descartar alterações?" }),
    ).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nome")).toHaveValue("Beatriz");

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(
      within(discardDialog()).getByRole("button", {
        name: "Continuar editando",
      }),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nome")).toHaveValue("Beatriz");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(
      within(discardDialog()).getByRole("button", { name: "Descartar" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mantém o formulário inacessível enquanto pergunta", () => {
    render(<NameForm onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Beatriz" },
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.getByRole("dialog", { name: "Editar nome", hidden: true })
        .parentElement,
    ).toHaveAttribute("inert");
    expect(
      within(discardDialog()).getByRole("button", {
        name: "Continuar editando",
      }),
    ).toHaveFocus();
  });

  it("voltar ao valor original conta como intacto", () => {
    const onClose = vi.fn();
    render(<NameForm onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Beatriz" },
    });
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Ana" },
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("não fecha nem pergunta durante o salvamento", () => {
    const onClose = vi.fn();
    const { rerender } = render(<NameForm onClose={onClose} />);
    fireEvent.change(screen.getByLabelText("Nome"), {
      target: { value: "Beatriz" },
    });
    rerender(<NameForm onClose={onClose} busy />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Fechar" })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: "Descartar alterações?" }),
    ).not.toBeInTheDocument();
  });

  it("formulário dentro do modal avisa a alteração e pergunta no Voltar", () => {
    function Inner({ onBack }: { onBack: () => void }) {
      const [notes, setNotes] = useState("");
      useModalDirty(useFormDirty(notes));
      const confirmDiscard = useConfirmDiscard();
      return (
        <>
          <label>
            Notas
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => confirmDiscard(onBack)}>
            Voltar
          </button>
        </>
      );
    }
    const onClose = vi.fn();
    const onBack = vi.fn();
    render(
      <Modal title="Fluxo" subtitle="Teste" onClose={onClose}>
        <Inner onBack={onBack} />
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Notas"), {
      target: { value: "Retorno" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    fireEvent.click(
      within(discardDialog()).getByRole("button", { name: "Descartar" }),
    );
    expect(onBack).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(discardDialog()).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
