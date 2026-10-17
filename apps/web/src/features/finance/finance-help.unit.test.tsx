import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpTip } from "../../shared/components/HelpTip";
import { financeTermHelp } from "./model";

describe("HelpTip", () => {
  it("opens on focus and on click, closes with Escape and describes the button", () => {
    render(
      <label>
        <span>
          Competência
          <HelpTip term="Competência" text={financeTermHelp.competence} />
        </span>
        <input type="month" />
      </label>,
    );
    const button = screen.getByRole("button", { name: "Ajuda: Competência" });
    const tip = document.getElementById(
      button.getAttribute("aria-describedby")!,
    )!;
    expect(tip).toHaveAttribute("role", "tooltip");
    expect(tip).toHaveTextContent("Mês a que a receita ou a despesa pertence");
    expect(tip).not.toBeVisible();

    fireEvent.focus(button);
    expect(tip).toBeVisible();
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(button, { key: "Escape" });
    expect(tip).not.toBeVisible();
    fireEvent.click(button);
    expect(tip).toBeVisible();
    fireEvent.click(button);
    expect(tip).not.toBeVisible();
    fireEvent.keyDown(button, { key: "Enter" });
    expect(tip).toBeVisible();
    fireEvent.blur(button);
    expect(tip).not.toBeVisible();
    // O campo continua achável pelo rótulo.
    expect(screen.getByLabelText(/^Competência/)).toHaveAttribute(
      "type",
      "month",
    );
  });

  it("has a short explanation for the four finance terms", () => {
    expect(Object.keys(financeTermHelp)).toEqual([
      "competence",
      "posted",
      "costCenter",
      "cashAvailable",
    ]);
    for (const text of Object.values(financeTermHelp))
      expect(text.length).toBeLessThan(120);
  });
});
