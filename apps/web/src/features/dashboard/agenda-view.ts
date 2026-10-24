import type { Professional } from "@crm/contracts";

/** Resumo da escolha: "Todos os profissionais", o nome de um ou "3 profissionais". */
export function agendaViewLabel(
  selected: readonly string[],
  professionals: readonly Professional[],
) {
  if (selected.length === 0) return "Todos os profissionais";
  if (selected.length === 1)
    return (
      professionals.find((item) => item.id === selected[0])?.fullName ??
      "1 profissional"
    );
  return `${selected.length} profissionais`;
}

/** Escolha "Visualização da agenda" lembrada por usuário neste navegador (vazia = todos). */
function agendaViewKey(userId: string | undefined) {
  return `crm.dashboard.agendaProfessionals.${userId ?? ""}`;
}

export function storedAgendaView(userId: string | undefined): string[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(agendaViewKey(userId)) ?? "[]",
    );
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function storeAgendaView(
  userId: string | undefined,
  ids: readonly string[],
) {
  try {
    if (ids.length > 0)
      localStorage.setItem(agendaViewKey(userId), JSON.stringify(ids));
    else localStorage.removeItem(agendaViewKey(userId));
  } catch {
    // Sem armazenamento (janela privada): a escolha vale só nesta visita.
  }
}
