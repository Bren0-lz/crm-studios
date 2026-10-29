import type { GroupClass } from "@crm/contracts";

/** Turmas ativas de algum serviço do plano: as que podem receber a matrícula. */
export function compatiblePlanGroups(
  groups: GroupClass[] | null | undefined,
  services: { serviceId: string }[],
) {
  return (groups ?? []).filter(
    (group) =>
      group.active &&
      services.some((item) => item.serviceId === group.serviceId),
  );
}

/**
 * Plano de aulas em grupo (algum serviço tem turma ativa) exige a turma. Sem as turmas
 * carregadas ainda não dá para saber, então a escolha fica pendente até carregar.
 */
export function planGroupMissing(
  groups: GroupClass[] | null | undefined,
  services: { serviceId: string }[],
  groupId: string,
) {
  if (!services.length) return false;
  if (groups == null) return !groupId;
  const choices = compatiblePlanGroups(groups, services);
  return choices.length > 0 && !choices.some((group) => group.id === groupId);
}
