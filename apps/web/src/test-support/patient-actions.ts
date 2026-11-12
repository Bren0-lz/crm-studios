import { fireEvent, screen, within } from "@testing-library/react";

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

/**
 * CD1: WhatsApp e contato de emergência são obrigatórios no cadastro manual e na conversão
 * de lead. Preenche o que estiver vazio no formulário (cadastro do cliente ou conversão).
 */
export function fillRequiredContact(form: HTMLElement) {
  const contact = within(form).getByRole("group", { name: "Contato" });
  const whatsapp = within(contact).getByLabelText("WhatsApp");
  if (!(whatsapp as HTMLInputElement).value)
    fireEvent.change(whatsapp, { target: { value: "11911110000" } });
  const emergency = within(form).getByRole("group", {
    name: "Contato de emergência",
  });
  const name = within(emergency).getByLabelText("Nome");
  if (!(name as HTMLInputElement).value)
    fireEvent.change(name, { target: { value: "Contato de Emergência" } });
  const phone = within(emergency).getByLabelText("Telefone");
  if (!(phone as HTMLInputElement).value)
    fireEvent.change(phone, { target: { value: "11911110000" } });
  const emergencyWhatsapp = within(emergency).getByLabelText("WhatsApp");
  if (!(emergencyWhatsapp as HTMLInputElement).value)
    fireEvent.change(emergencyWhatsapp, { target: { value: "11911110000" } });
}
