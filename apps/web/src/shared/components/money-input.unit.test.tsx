import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { parseMoneyToCents } from "../lib/formatting";
import { MoneyInput } from "./MoneyInput";

function Harness({ initial = 0 }: { initial?: number | null }) {
  const [cents, setCents] = useState<number | null>(initial);
  return (
    <>
      <label>
        Valor
        <MoneyInput valueInCents={cents} onChange={setCents} />
      </label>
      <output>{String(cents)}</output>
      <button onClick={() => setCents(1500)}>Trocar</button>
    </>
  );
}

describe("parseMoneyToCents", () => {
  it.each([
    ["45,90", 4590],
    ["45.90", 4590],
    ["45.9", 4590],
    ["45", 4500],
    ["045", 4500],
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["1.234", 123400],
    ["R$ 10", 1000],
    [",5", 50],
    ["45,", 4500],
  ])("reads %s as %i cents", (text, cents) => {
    expect(parseMoneyToCents(text)).toBe(cents);
  });

  it.each(["", "abc", "1,2,3", "4,567", "-5"])("rejects %j", (text) => {
    expect(parseMoneyToCents(text)).toBeNull();
  });
});

describe("MoneyInput", () => {
  it("accepts a comma or a dot and formats on blur", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Valor");
    fireEvent.change(input, { target: { value: "45,90" } });
    expect(screen.getByRole("status")).toHaveTextContent("4590");
    fireEvent.change(input, { target: { value: "45.9" } });
    expect(screen.getByRole("status")).toHaveTextContent("4590");
    fireEvent.blur(input);
    expect(input).toHaveValue("45,90");
  });

  it("lets the field be cleared instead of keeping a fixed zero", () => {
    render(<Harness initial={4500} />);
    const input = screen.getByLabelText("Valor");
    expect(input).toHaveValue("45,00");
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("null");
    fireEvent.change(input, { target: { value: "45" } });
    expect(input).toHaveValue("45");
    expect(screen.getByRole("status")).toHaveTextContent("4500");
  });

  it("shows a value replaced from outside", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Trocar" }));
    expect(screen.getByLabelText("Valor")).toHaveValue("15,00");
  });
});
