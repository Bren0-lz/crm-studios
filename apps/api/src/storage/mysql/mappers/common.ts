// Permite buscar "(11) 99000" em telefones gravados só com dígitos.
export function phoneSearchDigits(term: string) {
  return /^[\d\s()+-]+$/.test(term) ? term.replace(/\D/g, "") : "";
}

/**
 * Valor JSON montado na consulta (`JSON_OBJECT`, `JSON_ARRAYAGG`…): o MariaDB devolve texto,
 * o MySQL devolve o objeto. Colunas JSON das tabelas já chegam convertidas.
 */
export function json<T>(value: unknown): T {
  // `CASE`/`IF` em volta de um JSON montado pode voltar como binário no MariaDB.
  if (Buffer.isBuffer(value)) return JSON.parse(value.toString("utf8")) as T;
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

/** `EXISTS(...)`/comparações voltam 0/1 do MySQL; colunas `TINYINT(1)` já são boolean. */
export function bool(value: unknown) {
  return value === true || value === 1 || value === "1";
}
