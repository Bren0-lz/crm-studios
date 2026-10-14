import { z } from "zod";

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
});
export type ClinicCatalogInput = z.infer<typeof clinicCatalogInputSchema>;
export interface ClinicCatalogEntry extends ClinicCatalogInput {
  id: string;
  clinicId: string;
  kind: ClinicCatalogKind;
  createdAt: string;
  updatedAt: string;
}
