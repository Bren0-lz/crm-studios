// Permite buscar "(11) 99000" em telefones gravados só com dígitos.
export function phoneSearchDigits(term: string) {
  return /^[\d\s()+-]+$/.test(term) ? term.replace(/\D/g, "") : "";
}
