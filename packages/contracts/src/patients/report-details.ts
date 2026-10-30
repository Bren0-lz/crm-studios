import { z } from "zod";
import { patientProfileFilterSchema } from "./segments.js";
export const clientDetailsColumns = [
  "fullName",
  "recordNumber",
  "phone",
  "email",
  "birthDate",
  "status",
  "address",
  "neighborhood",
  "city",
  "state",
  "postalCode",
  "gender",
  "guardianName",
  "guardianPhone",
  "occupation",
  "source",
  "level",
  "clientSince",
  "imageConsent",
  "interests",
  "activePlans",
  "renewalDue",
  "availableReplacements",
  "waiting",
  "attendanceCount",
  "absenceCount",
  "attendanceRate",
  "equipment",
  "products",
  "productQuantity",
  "pendingReceivables",
  "overdueReceivables",
  "discount",
  "discountGranted",
] as const;
export type ClientDetailsColumn = (typeof clientDetailsColumns)[number];
export const clientDetailsColumnLabels: Record<ClientDetailsColumn, string> = {
  fullName: "Cliente",
  recordNumber: "Prontuário",
  phone: "Telefone",
  email: "E-mail",
  birthDate: "Nascimento",
  status: "Situação",
  address: "Endereço",
  neighborhood: "Bairro",
  city: "Cidade",
  state: "Estado",
  postalCode: "CEP",
  gender: "Gênero",
  guardianName: "Responsável",
  guardianPhone: "Telefone do responsável",
  occupation: "Profissão",
  source: "Origem",
  level: "Nível",
  clientSince: "Cliente desde",
  imageConsent: "Uso de imagem",
  interests: "Interesses",
  activePlans: "Planos vigentes",
  renewalDue: "Renovação em até 30 dias",
  availableReplacements: "Reposições disponíveis",
  waiting: "Lista de espera",
  attendanceCount: "Presenças no período",
  absenceCount: "Faltas no período",
  attendanceRate: "Frequência (%)",
  equipment: "Aparelhos utilizados",
  products: "Produtos adquiridos",
  productQuantity: "Quantidade de produtos",
  pendingReceivables: "Contas pendentes",
  overdueReceivables: "Contas atrasadas",
  discount: "Desconto dos planos",
  discountGranted: "Descontos concedidos no período",
};
export const clientDetailsFilterSchema = patientProfileFilterSchema
  .extend({
    from: z.iso.date(),
    to: z.iso.date(),
    search: z.string().trim().max(160).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    /** Clientes com ou sem desconto configurado. */
    discount: z.enum(["with", "without"]).optional(),
    columns: z
      .string()
      .transform((value) => value.split(","))
      .pipe(
        z
          .array(z.enum(clientDetailsColumns))
          .min(1)
          .max(clientDetailsColumns.length),
      )
      .optional(),
  })
  .refine(
    (value) =>
      value.to >= value.from &&
      Date.parse(value.to) - Date.parse(value.from) <= 366 * 86400000,
    "Escolha um período de até um ano.",
  );
export interface ClientDetailsReport {
  from: string;
  to: string;
  columns: ClientDetailsColumn[];
  availableColumns: ClientDetailsColumn[];
  rows: Array<{
    id: string;
    values: Partial<Record<ClientDetailsColumn, string | number | boolean>>;
  }>;
}
