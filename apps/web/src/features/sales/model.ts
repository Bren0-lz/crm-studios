import type { PatientTab } from "@crm/contracts";
import { localIsoDate } from "../../shared/lib/formatting";

export type SalesTab = "new" | "history" | "summary" | "inventory" | "catalogs";

export const salesTabLabels: Record<SalesTab, string> = {
  new: "Nova venda",
  history: "Vendas realizadas",
  summary: "Resumo",
  inventory: "Estoque",
  catalogs: "Categorias e marcas",
};

const tabKeys: Record<string, SalesTab> = {
  "nova-venda": "new",
  vendas: "history",
  resumo: "summary",
  estoque: "inventory",
  categorias: "catalogs",
};

/** Sub-aba pedida por `?aba=` (links diretos); desconhecida cai no padrão. */
export function salesTabFromParam(value: string | null): SalesTab | null {
  return (value && tabKeys[value]) || null;
}

export type SalesPeriod = { from: string; to: string };

/** Mês da data informada, do dia 1º ao último dia. */
export function monthPeriod(date = new Date(), offset = 0): SalesPeriod {
  const first = new Date(date.getFullYear(), date.getMonth() + offset, 1);
  const last = new Date(date.getFullYear(), date.getMonth() + offset + 1, 0);
  return { from: localIsoDate(first), to: localIsoDate(last) };
}

/** Dia (local) em que a venda foi registrada: fechamento ou, sem ele, abertura. */
export function saleDate(tab: PatientTab) {
  return localIsoDate(new Date(tab.closedAt ?? tab.openedAt));
}

/** Comandas fechadas ou canceladas que venderam produto, mais recentes primeiro. */
export function productSales(
  tabs: readonly PatientTab[],
  period: SalesPeriod,
  search = "",
) {
  const term = search.trim().toLocaleLowerCase("pt-BR");
  return tabs
    .filter(
      (tab) =>
        tab.status !== "open" &&
        tab.items.length > 0 &&
        saleDate(tab) >= period.from &&
        saleDate(tab) <= period.to &&
        (!term || tab.patientName.toLocaleLowerCase("pt-BR").includes(term)),
    )
    .sort((left, right) =>
      (right.closedAt ?? right.openedAt).localeCompare(
        left.closedAt ?? left.openedAt,
      ),
    );
}

export function productsTotalInCents(tab: PatientTab) {
  return tab.items.reduce((sum, item) => sum + item.totalInCents, 0);
}

export function saleItemsLabel(tab: PatientTab) {
  return tab.items
    .map((item) => `${item.quantity}× ${item.productName}`)
    .join(", ");
}

export type ProductSalesSummary = {
  totalInCents: number;
  salesCount: number;
  itemsCount: number;
  averageTicketInCents: number;
  topProducts: {
    productId: string;
    productName: string;
    quantity: number;
    revenueInCents: number;
  }[];
};

/** Indicadores do período: só produtos de comandas fechadas (canceladas ficam de fora). */
export function summarizeProductSales(
  tabs: readonly PatientTab[],
  period: SalesPeriod,
): ProductSalesSummary {
  const sales = productSales(tabs, period).filter(
    (tab) => tab.status === "closed",
  );
  const products = new Map<string, ProductSalesSummary["topProducts"][0]>();
  let totalInCents = 0,
    itemsCount = 0;
  for (const tab of sales)
    for (const item of tab.items) {
      totalInCents += item.totalInCents;
      itemsCount += item.quantity;
      const entry = products.get(item.productId) ?? {
        productId: item.productId,
        productName: item.productName,
        quantity: 0,
        revenueInCents: 0,
      };
      entry.quantity += item.quantity;
      entry.revenueInCents += item.totalInCents;
      products.set(item.productId, entry);
    }
  return {
    totalInCents,
    salesCount: sales.length,
    itemsCount,
    averageTicketInCents: sales.length
      ? Math.round(totalInCents / sales.length)
      : 0,
    topProducts: [...products.values()].sort(
      (left, right) =>
        right.revenueInCents - left.revenueInCents ||
        right.quantity - left.quantity ||
        left.productName.localeCompare(right.productName, "pt-BR"),
    ),
  };
}

export function saleStatusLabel(tab: PatientTab) {
  if (tab.status === "cancelled") return "Cancelada";
  return tab.paymentStatus === "paid" ? "Paga" : "A receber";
}
