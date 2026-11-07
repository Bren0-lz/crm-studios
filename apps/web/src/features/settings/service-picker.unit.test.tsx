import type { Service } from "@crm/contracts";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ServicePicker } from "./ServicePicker";

const service = (id: string, name: string, active = true) =>
  ({
    id,
    clinicId: "c",
    name,
    active,
    businessLine: "studio",
    durationMinutes: 50,
  }) as Service;

const services = [
  service("1", "Dançaterapia"),
  service("2", "Pilates individual"),
  service("3", "Pilates em grupo"),
  service("4", "Massoterapia", false),
];

function Harness({ onCreate }: { onCreate?: () => void }) {
  const [value, setValue] = useState("");
  return (
    <ServicePicker
      label="Serviço"
      srLabel=" 1"
      services={services}
      value={value}
      unavailableIds={["3"]}
      onChange={setValue}
      onCreate={onCreate}
    />
  );
}

describe("ServicePicker", () => {
  it("busca sem acento, bloqueia o serviço já usado e esconde inativos", () => {
    render(<Harness onCreate={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Serviço 1" });
    expect(input).toBeInvalid();
    fireEvent.focus(input);
    const list = screen.getByRole("listbox", { name: "Serviço 1: opções" });
    expect(within(list).getAllByRole("option")).toHaveLength(3);
    fireEvent.change(input, { target: { value: "danca" } });
    expect(within(list).getAllByRole("option")).toHaveLength(1);
    fireEvent.change(input, { target: { value: "pilates" } });
    const used = within(list).getByRole("option", { name: /em grupo/ });
    expect(used).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(used);
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("Pilates individual");
    expect(input).toBeValid();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("mantém o Novo serviço no rodapé e o Esc fecha só a lista", () => {
    const onCreate = vi.fn();
    const onModalKey = vi.fn();
    render(
      <div onKeyDown={onModalKey}>
        <Harness onCreate={onCreate} />
      </div>,
    );
    const input = screen.getByRole("combobox", { name: "Serviço 1" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onModalKey).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "nada" } });
    fireEvent.click(screen.getByRole("button", { name: "Novo serviço" }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(input).toHaveValue("");
  });

  it("sem permissão de cadastro não mostra o Novo serviço", () => {
    render(<Harness />);
    fireEvent.focus(screen.getByRole("combobox", { name: "Serviço 1" }));
    expect(
      screen.queryByRole("button", { name: "Novo serviço" }),
    ).not.toBeInTheDocument();
  });
});
