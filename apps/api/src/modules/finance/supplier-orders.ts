/** Motivo da entrada no histórico de estoque para os itens de um pedido ao fornecedor. */
export function orderStockNotes(supplierName: string, number: string) {
  return number
    ? `Pedido nº ${number} de ${supplierName}`
    : `Pedido de ${supplierName}`;
}

/** Código provisório do produto cadastrado por um pedido (pode ser trocado depois). */
export function supplierOrderSku(seed: string) {
  return `PED-${seed
    .replace(/[^0-9a-f]/gi, "")
    .slice(0, 8)
    .toUpperCase()}`;
}
