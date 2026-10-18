import { ApiClientError } from "./ApiClientError";
import { bumpDataVersion, domainsForMutation } from "./data-version";
import { TOKEN_KEY, clearSession } from "./session";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body !== undefined && options.body !== null
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const changed = () =>
    bumpDataVersion(domainsForMutation(options.method ?? "GET", path));
  // 204 não tem corpo (ex.: exclusão de feriado): não há JSON para ler.
  if (response.status === 204) {
    changed();
    return undefined as T;
  }
  const body = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      clearSession();
      window.dispatchEvent(new Event("crm:session-ended"));
    }
    if (response.status === 403 && path !== "/me")
      window.dispatchEvent(new Event("crm:access-denied"));
    throw new ApiClientError(
      body.message ?? "Não foi possível concluir a operação.",
      body.code ?? "UNKNOWN_ERROR",
      response.status,
      body.details,
    );
  }
  changed();
  return body as T;
}

export async function requestBlob(path: string) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      window.dispatchEvent(new Event("crm:session-ended"));
    }
    if (response.status === 403)
      window.dispatchEvent(new Event("crm:access-denied"));
    const body = (await response.json()) as { message?: string; code?: string };
    throw new ApiClientError(
      body.message ?? "Não foi possível exportar o relatório.",
      body.code ?? "UNKNOWN_ERROR",
      response.status,
    );
  }
  return response.blob();
}
