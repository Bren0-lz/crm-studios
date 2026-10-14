import type { DreGroup } from "@crm/contracts";
export const dreGroupLabels: Record<DreGroup, string> = {
  unclassified: "Não classificado",
  service_revenue: "Receita de serviços",
  product_revenue: "Receita de produtos",
  tax: "Impostos e deduções",
  service_cost: "Custos de serviços",
  product_cost: "Custos de produtos",
  variable_cost: "Custos variáveis",
  fixed_expense: "Despesas fixas",
  depreciation: "Depreciação",
  financial_result: "Resultado financeiro",
};
