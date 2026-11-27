import { ApiClientError } from "./ApiClientError";
import { branchHeaders } from "./branch";
import { bumpDataVersion, domainsForMutation } from "./data-version";
import { TOKEN_KEY, clearSession } from "./session";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export const NETWORK_ERROR_MESSAGE =
  "Sem conexão com o servidor. Verifique a internet e tente novamente.";

/**
 * `fetch` sem a mensagem crua do navegador ("Failed to fetch"): falha de rede vira
 * `ApiClientError` em pt-BR. Cancelamento (`AbortError`) segue como está.
 */
async function send(path: string, init: RequestInit) {
  try {
    return await fetch(`${API_URL}${path}`, init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new ApiClientError(NETWORK_ERROR_MESSAGE, "NETWORK_ERROR", 0);
  }
}

/**
 * Corpo JSON da resposta, ou `undefined` quando não é JSON (página de erro do proxy/hospedagem
 * durante um reinício, por exemplo) — nunca o "Unexpected token '<'" do `response.json()`.
 */
async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

/** Mensagem do erro sem corpo JSON, pelo status HTTP. */
function statusMessage(status: number, fallback: string) {
  if (status === 413)
    return "Os dados enviados são grandes demais. Reduza o arquivo e tente novamente.";
  if (status >= 500)
    return "O servidor está indisponível no momento. Tente novamente em instantes.";
  return fallback;
}

type ErrorBody = {
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
};

function errorBody(body: unknown): ErrorBody {
  return body && typeof body === "object" ? (body as ErrorBody) : {};
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await send(path, {
    ...options,
    headers: {
      ...(options.body !== undefined && options.body !== null
        ? { "Content-Type": "application/json" }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...branchHeaders(),
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
  const body = await readJson(response);
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      clearSession();
      window.dispatchEvent(new Event("crm:session-ended"));
    }
    if (response.status === 403 && path !== "/me")
      window.dispatchEvent(new Event("crm:access-denied"));
    const error = errorBody(body);
    throw new ApiClientError(
      error.message ??
        statusMessage(response.status, "Não foi possível concluir a operação."),
      error.code ?? "UNKNOWN_ERROR",
      response.status,
      error.details,
    );
  }
  if (body === undefined)
    throw new ApiClientError(
      "Resposta inesperada do servidor. Tente novamente.",
      "INVALID_RESPONSE",
      response.status,
    );
  changed();
  return body as T;
}

export async function requestBlob(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await send(path, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...branchHeaders(),
      ...options.headers,
    },
  });
  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      window.dispatchEvent(new Event("crm:session-ended"));
    }
    if (response.status === 403)
      window.dispatchEvent(new Event("crm:access-denied"));
    const body = errorBody(await readJson(response));
    throw new ApiClientError(
      body.message ??
        statusMessage(
          response.status,
          "Não foi possível exportar o relatório.",
        ),
      body.code ?? "UNKNOWN_ERROR",
      response.status,
    );
  }
  return response.blob();
}
