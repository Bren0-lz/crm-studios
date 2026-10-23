import { BRANCH_HEADER } from "@crm/contracts";

/** Filial ativa escolhida no cabeçalho; ausente = todas as filiais do usuário. */
export const BRANCH_KEY = "crm.branch.id";

/** Evento disparado quando a filial ativa muda (as telas recarregam os dados). */
export const BRANCH_CHANGED_EVENT = "crm:branch-changed";

export function getStoredBranchId() {
  return localStorage.getItem(BRANCH_KEY);
}

export function storeBranchId(id: string | null) {
  if (id) localStorage.setItem(BRANCH_KEY, id);
  else localStorage.removeItem(BRANCH_KEY);
  window.dispatchEvent(new Event(BRANCH_CHANGED_EVENT));
}

/** Cabeçalho da filial ativa (vazio = consolidado). */
export function branchHeaders(): Record<string, string> {
  const id = getStoredBranchId();
  return id ? { [BRANCH_HEADER]: id } : {};
}

/**
 * Opções de requisição que ignoram a filial ativa: a ficha do cliente (cadastro único) mostra o
 * histórico de todas as filiais que o usuário acessa.
 */
export const allBranches: RequestInit = { headers: { [BRANCH_HEADER]: "all" } };
