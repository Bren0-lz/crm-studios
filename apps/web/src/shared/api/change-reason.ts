/** Corpo de uma edição com o motivo opcional (`changeReason`), que vai para o Histórico. */
export function withChangeReason<T extends object>(
  input: T,
  changeReason?: string,
): T & { changeReason?: string } {
  const reason = changeReason?.trim();
  return reason ? { ...input, changeReason: reason } : input;
}
