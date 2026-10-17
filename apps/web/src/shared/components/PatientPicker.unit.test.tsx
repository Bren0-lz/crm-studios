import type { PatientOption } from "@crm/contracts";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { PatientPicker } from "../../PatientPicker";

const ana: PatientOption = {
  id: "ana",
  fullName: "Ana Azevedo Gomes",
  tags: [],
};
const breno: PatientOption = {
  id: "breno",
  fullName: "Breno Luiz Silva do Carmo",
  tags: [],
};

function Form({
  patients = [ana],
  disabled = false,
}: {
  patients?: PatientOption[];
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <form>
      <PatientPicker
        required
        patients={patients}
        value={value}
        onChange={setValue}
        disabled={disabled}
      />
      <button disabled={!value}>Salvar</button>
      <span data-testid="selected-id">{value}</span>
    </form>
  );
}

const picker = () =>
  screen.getByRole<HTMLInputElement>("combobox", { name: "Cliente" });
async function search(term: string) {
  fireEvent.change(picker(), { target: { value: term } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(api, "patientOptions").mockResolvedValue([breno]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("PatientPicker", () => {
  it("opens an opt-in native popover inside the picker and closes before the outer Escape handler", () => {
    const show = vi.spyOn(HTMLElement.prototype, "showPopover");
    const onChange = vi.fn();
    const outerEscape = vi.fn();
    const view = render(
      <div onKeyDown={outerEscape}>
        <PatientPicker patients={[ana]} value="" onChange={onChange} popover />
      </div>,
    );
    fireEvent.focus(picker());
    const panel = screen.getByRole("listbox").parentElement!;
    expect(panel).toHaveAttribute("popover", "manual");
    expect(view.container).toContainElement(panel);
    expect(show).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(screen.getByRole("option", { name: ana.fullName }));
    fireEvent.click(screen.getByRole("option", { name: ana.fullName }));
    expect(onChange).toHaveBeenCalledWith(ana.id, ana);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.focus(picker());
    fireEvent.keyDown(picker(), { key: "Escape" });
    expect(outerEscape).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.keyDown(picker(), { key: "Escape" });
    expect(outerEscape).toHaveBeenCalledTimes(1);
  });

  it("positions the popover within the viewport and switches above a low field", () => {
    vi.stubGlobal("innerWidth", 320);
    vi.stubGlobal("innerHeight", 480);
    let anchor = new DOMRect(30, 100, 220, 44);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return this.classList.contains("patient-picker-results")
          ? new DOMRect(
              0,
              0,
              parseFloat(this.style.width),
              Math.min(240, parseFloat(this.style.maxHeight)),
            )
          : anchor;
      },
    );
    render(
      <PatientPicker patients={[ana]} value="" onChange={vi.fn()} popover />,
    );
    fireEvent.focus(picker());
    const panel = screen.getByRole("listbox").parentElement!;
    expect(panel.style.width).toBe("220px");
    expect(panel.style.top).toBe("152px");
    expect(panel.style.left).toBe("30px");
    anchor = new DOMRect(240, 400, 220, 44);
    fireEvent(window, new Event("resize"));
    expect(panel.style.left).toBe("88px");
    expect(panel.style.top).toBe("152px");
    expect(panel.style.maxHeight).toBe("240px");
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.focus(picker());
    fireEvent.blur(picker());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("repositions within the visual viewport when the mobile keyboard reduces the visible area", () => {
    const viewport = Object.assign(new EventTarget(), {
      width: 320,
      height: 480,
      offsetTop: 0,
      offsetLeft: 0,
    });
    vi.stubGlobal("visualViewport", viewport);
    let anchor = new DOMRect(20, 100, 220, 44);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return this.classList.contains("patient-picker-results")
          ? new DOMRect(
              0,
              0,
              parseFloat(this.style.width),
              Math.min(240, parseFloat(this.style.maxHeight)),
            )
          : anchor;
      },
    );
    const view = render(
      <PatientPicker patients={[ana]} value="" onChange={vi.fn()} popover />,
    );
    fireEvent.focus(picker());
    const panel = screen.getByRole("listbox").parentElement!;
    expect(panel.style.top).toBe("152px");
    viewport.height = 200;
    viewport.offsetTop = 40;
    viewport.dispatchEvent(new Event("resize"));
    expect(panel.style.maxHeight).toBe("76px");
    anchor = new DOMRect(20, 380, 220, 44);
    viewport.dispatchEvent(new Event("scroll"));
    expect(panel.style.maxHeight).toBe("176px");
    expect(panel.style.top).toBe("52px");
    const remove = vi.spyOn(viewport, "removeEventListener");
    view.unmount();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it("distinguishes initial loading from an empty list", () => {
    const props = { patients: [], value: "", onChange: vi.fn() };
    const view = render(<PatientPicker {...props} loading />);
    fireEvent.focus(picker());
    expect(screen.getByRole("status")).toHaveTextContent("Buscando clientes");
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-busy", "true");
    view.rerender(<PatientPicker {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Nenhum cliente encontrado",
    );
    expect(screen.getByRole("listbox")).toHaveAttribute("aria-busy", "false");
  });

  it.each(["Breno", "12345678909", "123.456.789-09"])(
    "searches %s and retains a result outside the initial list",
    async (term) => {
      const view = render(<Form />);
      expect(picker()).toHaveValue("");
      expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
      await search(` ${term} `);
      expect(api.patientOptions).toHaveBeenCalledWith(term);
      fireEvent.click(screen.getByRole("option", { name: breno.fullName }));
      expect(picker()).toHaveValue(breno.fullName);
      expect(screen.getByTestId("selected-id")).toHaveTextContent(breno.id);
      expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
      view.rerender(<Form patients={[{ ...ana }]} />);
      expect(picker()).toHaveValue(breno.fullName);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(api.patientOptions).toHaveBeenCalledTimes(1);
    },
  );

  it("debounces searches and ignores stale responses", async () => {
    let finishOld!: (items: PatientOption[]) => void;
    vi.mocked(api.patientOptions).mockImplementation((term) =>
      term === "Antigo"
        ? new Promise((resolve) => {
            finishOld = resolve;
          })
        : Promise.resolve([breno]),
    );
    render(<Form />);
    fireEvent.change(picker(), { target: { value: "A" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(249);
    });
    expect(api.patientOptions).not.toHaveBeenCalled();
    await search("Antigo");
    expect(screen.getByRole("status")).toHaveTextContent("Buscando clientes");
    await search("Novo");
    expect(
      screen.getByRole("option", { name: breno.fullName }),
    ).toBeInTheDocument();
    await act(async () => {
      finishOld([ana]);
    });
    expect(
      screen.queryByRole("option", { name: ana.fullName }),
    ).not.toBeInTheDocument();
  });

  it("completes a search after adding whitespace to an already resolved query", async () => {
    render(<Form />);
    await search("Breno");
    await search("Breno ");
    expect(
      screen.getByRole("option", { name: breno.fullName }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Buscando clientes…")).not.toBeInTheDocument();
    expect(api.patientOptions).toHaveBeenLastCalledWith("Breno");
  });

  it("requires selecting an option and clears the ID when the text is edited", async () => {
    render(<Form />);
    await search("Breno");
    expect(picker().checkValidity()).toBe(false);
    fireEvent.keyDown(picker(), { key: "ArrowDown" });
    expect(picker()).toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(picker(), { key: "Enter" });
    expect(picker().checkValidity()).toBe(true);
    fireEvent.change(picker(), { target: { value: "Ana" } });
    expect(screen.getByTestId("selected-id")).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(picker().checkValidity()).toBe(false);
    fireEvent.change(picker(), { target: { value: "" } });
    expect(
      screen.getByRole("option", { name: ana.fullName }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Buscando clientes…")).not.toBeInTheDocument();
  });

  it("distinguishes empty results and errors, and recovers on a new search", async () => {
    vi.mocked(api.patientOptions)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Falha na consulta"));
    render(<Form />);
    await search("Ninguém");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Nenhum cliente encontrado",
    );
    await search("Erro");
    expect(screen.getByRole("alert")).toHaveTextContent("Falha na consulta");
    expect(
      screen.queryByText("Nenhum cliente encontrado"),
    ).not.toBeInTheDocument();
    await search("Breno");
    expect(
      screen.getByRole("option", { name: breno.fullName }),
    ).toBeInTheDocument();
  });

  it("closes on Escape without closing the containing modal, and supports ArrowUp", () => {
    const onKeyDown = vi.fn();
    render(
      <div onKeyDown={onKeyDown}>
        <Form patients={[ana, breno]} />
      </div>,
    );
    fireEvent.focus(picker());
    fireEvent.keyDown(picker(), { key: "ArrowUp" });
    fireEvent.keyDown(picker(), { key: "Enter" });
    expect(picker()).toHaveValue(breno.fullName);
    fireEvent.focus(picker());
    onKeyDown.mockClear();
    fireEvent.keyDown(picker(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it("synchronizes external selection, updated names, and clearing", async () => {
    const onChange = vi.fn();
    const view = render(
      <PatientPicker patients={[ana]} value="" onChange={onChange} />,
    );
    await search("Breno");
    view.rerender(
      <PatientPicker
        patients={[ana, breno]}
        value={breno.id}
        onChange={onChange}
      />,
    );
    expect(picker()).toHaveValue(breno.fullName);
    view.rerender(
      <PatientPicker
        patients={[{ ...breno, fullName: "Breno atualizado" }]}
        value={breno.id}
        onChange={onChange}
      />,
    );
    expect(picker()).toHaveValue("Breno atualizado");
    view.rerender(
      <PatientPicker patients={[ana]} value="" onChange={onChange} />,
    );
    expect(picker()).toHaveValue("");
  });

  it("supports optional fields and respects disabled state and search length", () => {
    const view = render(
      <PatientPicker patients={[ana]} value="" onChange={vi.fn()} />,
    );
    expect(picker().checkValidity()).toBe(true);
    expect(picker()).toHaveAttribute("maxlength", "160");
    view.rerender(
      <PatientPicker
        disabled
        patients={[ana]}
        value={ana.id}
        onChange={vi.fn()}
      />,
    );
    expect(picker()).toBeDisabled();
    fireEvent.focus(picker());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(api.patientOptions).not.toHaveBeenCalled();
  });

  it("gives each picker a distinct accessible listbox", () => {
    render(
      <>
        <Form />
        <Form />
      </>,
    );
    const inputs = screen.getAllByRole("combobox", { name: "Cliente" });
    inputs.forEach((input) => fireEvent.focus(input));
    expect(inputs[0]!.getAttribute("aria-controls")).not.toBe(
      inputs[1]!.getAttribute("aria-controls"),
    );
  });
});
