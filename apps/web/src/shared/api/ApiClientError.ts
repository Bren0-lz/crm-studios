export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    /** Dados extras do erro de domínio (ex.: `patientCount` ao excluir etiqueta em uso). */
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
