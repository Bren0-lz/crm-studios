import type { UserSummary } from "@crm/contracts";

export const TOKEN_KEY = "crm.auth.token";

export const USER_KEY = "crm.auth.user";

export interface Session {
  token: string;
  user: UserSummary;
}

export function getStoredUser(): UserSummary | null {
  const value = localStorage.getItem(USER_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as UserSummary;
  } catch {
    clearSession();
    return null;
  }
}

/** Grava o usuário logado (ex.: depois de buscar `/me` para completar uma sessão antiga). */
export function storeUser(user: UserSummary) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function hasSession() {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}
