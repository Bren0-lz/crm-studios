import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "../App";
import "../test-support/legacy-setup";

describe("modal scroll lock", () => {
  function StackedModals() {
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
            <button onClick={() => setFirst(false)}>Fechar primeiro</button>
          </Modal>
        )}
        {second && (
          <Modal
            title="Segundo"
            subtitle="Modal de cima"
            onClose={() => setSecond(false)}
          >
            <button onClick={() => setSecond(false)}>Fechar segundo</button>
          </Modal>
        )}
      </>
    );
  }

  it("locks body scroll while a modal is open and restores it on close", () => {
    render(<StackedModals />);
    expect(document.body).not.toHaveClass("modal-open");
    expect(document.documentElement).not.toHaveClass("modal-open");
    fireEvent.click(screen.getByRole("button", { name: "Abrir primeiro" }));
    expect(document.body).toHaveClass("modal-open");
    expect(document.documentElement).toHaveClass("modal-open");
    fireEvent.click(screen.getByRole("button", { name: "Fechar primeiro" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass("modal-open");
    expect(document.documentElement).not.toHaveClass("modal-open");
  });

  it("keeps the lock with stacked modals until the last one closes", () => {
    render(<StackedModals />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir primeiro" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir segundo" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Fechar segundo" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(document.body).toHaveClass("modal-open");
    expect(document.documentElement).toHaveClass("modal-open");
    fireEvent.click(screen.getByRole("button", { name: "Fechar primeiro" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass("modal-open");
    expect(document.documentElement).not.toHaveClass("modal-open");
  });

  it("releases the lock when an open modal is unmounted", () => {
    render(<StackedModals />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir primeiro" }));
    expect(document.body).toHaveClass("modal-open");
    expect(document.documentElement).toHaveClass("modal-open");
    cleanup();
    expect(document.body).not.toHaveClass("modal-open");
    expect(document.documentElement).not.toHaveClass("modal-open");
  });

  it("compensates the rendered scrollbar gutter once and restores existing padding", () => {
    const root = document.documentElement;
    vi.spyOn(root, "clientWidth", "get").mockReturnValue(window.innerWidth);
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, window.innerWidth - 10, 720),
    );
    const originalPadding = document.body.style.paddingRight;
    document.body.style.paddingRight = "4px";
    try {
      render(<StackedModals />);
      fireEvent.click(screen.getByRole("button", { name: "Abrir primeiro" }));
      expect(document.body.style.paddingRight).toBe("10px");
      fireEvent.click(screen.getByRole("button", { name: "Abrir segundo" }));
      expect(document.body.style.paddingRight).toBe("10px");
      fireEvent.click(screen.getByRole("button", { name: "Fechar segundo" }));
      expect(document.body.style.paddingRight).toBe("10px");
      fireEvent.click(screen.getByRole("button", { name: "Fechar primeiro" }));
      expect(document.body.style.paddingRight).toBe("4px");
    } finally {
      cleanup();
      document.body.style.paddingRight = originalPadding;
    }
  });
});
