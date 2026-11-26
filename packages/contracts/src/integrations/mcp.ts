/**
 * Conector MCP do manual (INT5): a tela de Integrações só informa se ele está ligado e qual
 * o endereço. O token fica na configuração da hospedagem (`MCP_ACCESS_TOKEN_SHA256`) e nunca
 * passa por esta resposta.
 */
export interface McpConnectorStatus {
  /** `false` quando a hospedagem não configurou o MCP (ou configurou errado). */
  enabled: boolean;
  /** `<MCP_PUBLIC_ORIGIN>/api/mcp`; `null` com o MCP desligado. */
  endpoint: string | null;
}
