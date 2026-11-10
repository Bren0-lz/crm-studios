import { z } from "zod";
import { productSizesSchema } from "../finance/model.js";

export const clinicCatalogKindSchema = z.enum([
  "interest",
  "level",
  "product_category",
  "product_brand",
  "muscle_group",
  "lead_source",
  "lead_channel",
  "lead_lost_reason",
]);
export type ClinicCatalogKind = z.infer<typeof clinicCatalogKindSchema>;
export const clinicCatalogLabels: Record<ClinicCatalogKind, string> = {
  interest: "Interesses",
  level: "Níveis",
  product_category: "Categorias de produtos",
  product_brand: "Marcas",
  muscle_group: "Grupos musculares",
  lead_source: "Origens",
  lead_channel: "Formas de contato",
  lead_lost_reason: "Motivos de não efetivação",
};
export const clinicCatalogInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  active: z.boolean().default(true),
  parentId: z.uuid().nullable().optional(),
  /**
   * Tamanhos que os produtos da categoria podem ter, na ordem de exibição (só categorias de
   * produtos). Vazio = sem distinção por tamanhos; ausente = nenhum (cadastro) ou mantém os atuais.
   */
  sizes: productSizesSchema.optional(),
});
export type ClinicCatalogInput = z.infer<typeof clinicCatalogInputSchema>;
export interface ClinicCatalogEntry extends ClinicCatalogInput {
  id: string;
  sizes: string[];
  clinicId: string;
  kind: ClinicCatalogKind;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tamanhos que valem para os produtos da categoria: os dela ou, numa subcategoria sem tamanhos
 * próprios, os da categoria principal. Sem categoria (ou sem tamanhos) = lista vazia.
 */
export function productCategorySizes(
  categories: readonly ClinicCatalogEntry[],
  categoryId: string | null | undefined,
): string[] {
  const category = categories.find((item) => item.id === categoryId);
  if (!category) return [];
  if (category.sizes.length) return category.sizes;
  return categories.find((item) => item.id === category.parentId)?.sizes ?? [];
}
