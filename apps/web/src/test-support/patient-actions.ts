import { fireEvent, screen } from "@testing-library/react";

/** Ações secundárias de Clientes ficam no menu "Mais" (V2). */
export function clickMoreAction(name: string) {
  fireEvent.click(screen.getByRole("button", { name: "Mais" }));
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

export async function findMoreAction(name: string) {
  fireEvent.click(await screen.findByRole("button", { name: "Mais" }));
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

/** Itens do menu "Mais" (vazio quando o menu nem aparece). */
export function moreActionNames(): string[] {
  const more = screen.queryByRole("button", { name: "Mais" });
  if (!more) return [];
  fireEvent.click(more);
  const names = screen
    .queryAllByRole("menuitem")
    .map((item) => item.textContent?.trim() ?? "");
  fireEvent.click(more);
  return names;
}
