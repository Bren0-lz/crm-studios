import type {
  ClinicCatalogEntry,
  PatientTab,
  Product,
  ProductSize,
} from "@crm/contracts";
import {
  legacyProductSizeLabels,
  productItemName,
  productSizeLabel,
} from "@crm/contracts";
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
    .map((item) => `${item.quantity}× ${productItemName(item)}`)
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

/** Chave de estoque que pode ser escolhida num ajuste ou numa venda. */
export type StockChoice = {
  size: ProductSize | null;
  currentStock: number;
  /** Faz parte da configuração atual (vende e recebe entrada); senão, é sobra a baixar. */
  configured: boolean;
};

/**
 * Chaves de estoque do produto: com tamanhos, os saldos por tamanho (inclui sobras); sem
 * tamanhos, o estoque sem tamanho seguido das sobras de tamanhos antigos. Uma chave só = sem escolha.
 */
export function stockChoices(product: Product): StockChoice[] {
  if (product.sizes.length)
    return product.sizeStock.map((entry) => ({
      ...entry,
      configured: entry.size !== null && product.sizes.includes(entry.size),
    }));
  const leftovers = product.sizeStock.reduce(
    (sum, entry) => sum + entry.currentStock,
    0,
  );
  return [
    {
      size: null,
      currentStock: product.currentStock - leftovers,
      configured: true,
    },
    ...product.sizeStock.map((entry) => ({ ...entry, configured: false })),
  ];
}

/**
 * Tamanhos configurados com saldo zerado ("Esgotado: P, GG"), na ordem da escala. Fica vazio
 * quando o produto todo está sem estoque: aí a situação "Sem estoque" já avisa.
 */
export function soldOutSizes(product: Product): string[] {
  if (product.currentStock <= 0) return [];
  return product.sizes
    .filter(
      (size) =>
        (product.sizeStock.find((entry) => entry.size === size)?.currentStock ??
          0) <= 0,
    )
    .map((size) => productSizeLabel(size));
}

/** Saldo que pode ser vendido no tamanho (ou sem tamanho, para produto sem tamanhos). */
export function sellableStock(product: Product, size: ProductSize | undefined) {
  return (
    stockChoices(product).find(
      (choice) => choice.configured && choice.size === (size ?? null),
    )?.currentStock ?? 0
  );
}

/** Valor de `<select>` para uma chave de estoque ("none" = sem tamanho). */
export const sizeChoiceValue = (size: ProductSize | null | undefined) =>
  size ?? "none";

export type SoldItemsView = "item" | "type" | "size";

export const soldItemsViewLabels: Record<SoldItemsView, string> = {
  item: "Produto e tamanho",
  type: "Tipo de item",
  size: "Tamanho",
};

/** Item vendido (comanda fechada) com o tipo (categoria do produto) e o tamanho. */
export type SoldItemLine = {
  typeKey: string;
  typeName: string;
  productId: string;
  productName: string;
  sizeKey: string;
  sizeLabel: string;
  quantity: number;
  revenueInCents: number;
};

export type SoldItemsFilter = { type: string; size: string };

export type SoldItemRow = Omit<SoldItemLine, "productId"> & { key: string };

function categoryName(
  categories: readonly ClinicCatalogEntry[],
  id: string | null | undefined,
) {
  const category = categories.find((item) => item.id === id);
  if (!category) return "Não classificado";
  const parent = categories.find((item) => item.id === category.parentId);
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

/** Itens das vendas fechadas do período, prontos para agrupar por tipo e tamanho. */
export function soldItemLines(
  tabs: readonly PatientTab[],
  period: SalesPeriod,
  products: readonly Product[],
  categories: readonly ClinicCatalogEntry[],
): SoldItemLine[] {
  return productSales(tabs, period)
    .filter((tab) => tab.status === "closed")
    .flatMap((tab) =>
      tab.items.map((item) => {
        const categoryId = products.find(
          (product) => product.id === item.productId,
        )?.categoryId;
        return {
          typeKey: categoryId || "none",
          typeName: categoryName(categories, categoryId),
          productId: item.productId,
          productName: item.productName,
          sizeKey: sizeChoiceValue(item.size),
          sizeLabel: productSizeLabel(item.size),
          quantity: item.quantity,
          revenueInCents: item.totalInCents,
        };
      }),
    );
}

/** Ranking dos mais vendidos (quantidade, depois receita) agrupado pela visão escolhida. */
export function rankSoldItems(
  lines: readonly SoldItemLine[],
  view: SoldItemsView,
  filter: SoldItemsFilter,
): SoldItemRow[] {
  const rows = new Map<string, SoldItemRow>();
  for (const line of lines) {
    if (filter.type && line.typeKey !== filter.type) continue;
    if (filter.size && line.sizeKey !== filter.size) continue;
    const key =
      view === "type"
        ? line.typeKey
        : view === "size"
          ? line.sizeKey
          : `${line.productId}:${line.sizeKey}`;
    const row = rows.get(key) ?? {
      key,
      typeKey: line.typeKey,
      typeName: line.typeName,
      productName: line.productName,
      sizeKey: line.sizeKey,
      sizeLabel: line.sizeLabel,
      quantity: 0,
      revenueInCents: 0,
    };
    row.quantity += line.quantity;
    row.revenueInCents += line.revenueInCents;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (left, right) =>
      right.quantity - left.quantity ||
      right.revenueInCents - left.revenueInCents ||
      left.typeName.localeCompare(right.typeName, "pt-BR") ||
      left.productName.localeCompare(right.productName, "pt-BR") ||
      left.sizeLabel.localeCompare(right.sizeLabel, "pt-BR"),
  );
}

/** Códigos antigos na ordem da escala; os demais tamanhos vêm depois, em ordem natural. */
const legacySizeOrder = Object.keys(legacyProductSizeLabels);
const sizeOrder = (key: string) => {
  const index = legacySizeOrder.indexOf(key);
  return index < 0 ? legacySizeOrder.length : index;
};

/** Opções distintas (valor e rótulo) de tipo ou tamanho presentes nas vendas. */
export function soldItemOptions(
  lines: readonly SoldItemLine[],
  field: "type" | "size",
) {
  const options = new Map<string, string>();
  for (const line of lines)
    if (field === "type") options.set(line.typeKey, line.typeName);
    else options.set(line.sizeKey, line.sizeLabel);
  return [...options].sort(([leftKey, left], [rightKey, right]) =>
    field === "size"
      ? sizeOrder(leftKey) - sizeOrder(rightKey) ||
        left.localeCompare(right, "pt-BR", { numeric: true })
      : left.localeCompare(right, "pt-BR"),
  );
}
