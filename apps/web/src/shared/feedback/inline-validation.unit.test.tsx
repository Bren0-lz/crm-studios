import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { installInlineValidation } from "./inline-validation";

let uninstall = () => undefined as void;
afterEach(() => uninstall());

describe("inline validation", () => {
  it("shows Portuguese messages under the fields, focuses the first and clears when fixed", () => {
    uninstall = installInlineValidation(document);
    render(
      <form className="form-grid">
        <label>
          Nome
          <input required />
        </label>
        <label>
          E-mail
          <input type="email" defaultValue="x" />
        </label>
        <label>
          Serviço
          <select required defaultValue="">
            <option value="">Selecione</option>
            <option value="a">A</option>
          </select>
        </label>
      </form>,
    );
    const form = document.querySelector("form")!;
    expect(form.reportValidity()).toBe(false);
    const name = screen.getByRole("textbox", { name: /Nome/ });
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAttribute("aria-description", "Preencha este campo.");
    expect(name).toHaveAccessibleName("Nome");
    expect(
      name.closest("label")!.querySelector(".inline-field-error"),
    ).toHaveAttribute("data-message", "Preencha este campo.");
    expect(name).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "E-mail" })).toHaveAttribute(
      "aria-description",
      "Informe um e-mail válido.",
    );
    expect(screen.getByRole("combobox", { name: "Serviço" })).toHaveAttribute(
      "aria-description",
      "Selecione uma opção.",
    );

    fireEvent.input(name, { target: { value: "Ana" } });
    expect(name).not.toHaveAttribute("aria-invalid");
    expect(name).not.toHaveAttribute("aria-description");
    expect(document.querySelector(".inline-field-error")).not.toBe(null);
    expect(
      name.closest("label")!.querySelector(".inline-field-error"),
    ).toBeNull();
  });

  it("never creates an error while typing in a field without one", () => {
    uninstall = installInlineValidation(document);
    render(
      <form>
        <label>
          E-mail
          <input type="email" required minLength={5} />
        </label>
      </form>,
    );
    const email = screen.getByRole("textbox", { name: "E-mail" });
    fireEvent.input(email, { target: { value: "jo" } });
    fireEvent.change(email, { target: { value: "joao" } });
    fireEvent.input(email, { target: { value: "" } });
    expect(email).not.toHaveAttribute("aria-invalid");
    expect(email).not.toHaveAttribute("aria-description");
    expect(document.querySelector(".inline-field-error")).toBeNull();
  });

  it("updates the message of a marked field that is still invalid and clears it when valid", () => {
    uninstall = installInlineValidation(document);
    render(
      <form>
        <label>
          E-mail
          <input type="email" required />
        </label>
        <label>
          Nome
          <input required minLength={3} />
        </label>
      </form>,
    );
    const form = document.querySelector("form")!;
    expect(form.reportValidity()).toBe(false);
    const email = screen.getByRole("textbox", { name: /E-mail/ });
    const name = screen.getByRole("textbox", { name: /Nome/ });
    const errorOf = (field: HTMLElement) =>
      field.closest("label")!.querySelector(".inline-field-error");
    expect(email).toHaveAttribute("aria-description", "Preencha este campo.");

    fireEvent.input(email, { target: { value: "joao" } });
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute(
      "aria-description",
      "Informe um e-mail válido.",
    );
    expect(errorOf(email)).toHaveAttribute(
      "data-message",
      "Informe um e-mail válido.",
    );

    // jsdom não calcula tooShort em valor definido por script: simula a regra.
    Object.defineProperty(name, "validity", {
      configurable: true,
      get: () => ({ valid: false, valueMissing: false, tooShort: true }),
    });
    fireEvent.input(name, { target: { value: "Jo" } });
    expect(name).toHaveAttribute(
      "aria-description",
      "Use pelo menos 3 caracteres.",
    );
    expect(errorOf(name)).toHaveAttribute(
      "data-message",
      "Use pelo menos 3 caracteres.",
    );

    fireEvent.input(email, { target: { value: "joao@exemplo.com" } });
    expect(email).not.toHaveAttribute("aria-invalid");
    expect(email).not.toHaveAttribute("aria-description");
    expect(errorOf(email)).toBeNull();
  });
});
