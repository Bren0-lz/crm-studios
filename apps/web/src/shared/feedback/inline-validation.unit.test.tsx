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
});
