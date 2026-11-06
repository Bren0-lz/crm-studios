import { z } from "zod";
import {
  documentTemplateVariables,
  type DocumentTemplateValues,
} from "./variables.js";
import { documentContentSchema, documentContentText } from "./content.js";
import {
  formatCnpj,
  formatCpf,
  formatPhone,
  isValidCpf,
  type paymentMethodSchema,
} from "../common/model.js";
import { paymentMethodLabels } from "../finance/installments.js";
import type { SupplierBillingCycle } from "../finance/types.js";

type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const documentKindSchema = z.enum([
  "contract",
  "attendance_declaration",
  "consent",
  "other",
]);

const templateBodyShape = z
  .object({
    body: z.string().trim().max(20_000).default(""),
    content: documentContentSchema.optional(),
  })
  .transform((input) => ({
    ...input,
    body: input.content
      ? documentContentText(input.content).trim()
      : input.body,
  }))
  .refine(
    (input) => input.body.length >= 20,
    "O conteúdo precisa ter pelo menos 20 caracteres.",
  );
export const documentTemplateInputSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    kind: documentKindSchema,
    body: z.string().trim().max(20_000).default(""),
    content: documentContentSchema.optional(),
  })
  .transform((input) => ({
    ...input,
    body: input.content
      ? documentContentText(input.content).trim()
      : input.body,
  }))
  .refine(
    (input) => input.body.length >= 20,
    "O conteúdo precisa ter pelo menos 20 caracteres.",
  );
export const documentTemplateVersionInputSchema = templateBodyShape;

/** Campos da emissão sem a regra de quem assina (base para `omit` na contratação de plano). */
export const issuedDocumentFieldsSchema = z.object({
  templateId: z.uuid(),
  /** Quem assina: um cliente (`patientId`) ou um fornecedor (`supplierId`), nunca os dois. */
  patientId: z.uuid().optional(),
  supplierId: z.uuid().optional(),
  planId: z.uuid().optional(),
  professionalId: z.uuid().optional(),
  title: z.string().trim().min(3).max(160),
  content: documentContentSchema
    .refine(
      (content) => documentContentText(content).trim().length >= 20,
      "O conteúdo precisa ter pelo menos 20 caracteres.",
    )
    .optional(),
});

export const issuedDocumentInputSchema = issuedDocumentFieldsSchema
  .refine((input) => Boolean(input.patientId) !== Boolean(input.supplierId), {
    message: "Informe o cliente ou o fornecedor do documento.",
    path: ["patientId"],
  })
  .refine((input) => !input.supplierId || !input.planId, {
    message: "Documento de fornecedor não tem plano vinculado.",
    path: ["planId"],
  });

export const documentStatusSchema = z.enum(["draft", "issued", "cancelled"]);

export const documentTransitionSchema = z.enum(["issued", "cancelled"]);

export const documentSignatureInputSchema = z.object({
  signedOn: z.iso.date(),
  responsibleName: z.string().trim().min(2).max(160),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
  sizeInBytes: z.number().int().min(1).max(5242880),
  contentBase64: z.string().min(1).max(7000000),
});

/** Campos que a emissão de documentos substitui (memória e PostgreSQL). */
export {
  documentTemplateVariables,
  type DocumentTemplateVariable,
  type DocumentTemplateValues,
} from "./variables.js";

/** Texto usado quando o cadastro não tem o dado pedido pelo modelo. */
export const missingDocumentValue = "não informado";

const noPlanValue = "Não vinculado";
const noSupplierValue = "Não vinculado";

/** Dados da emissão: cadastro da clínica, do cliente, plano e profissional. */
export interface DocumentTemplateContext {
  clinic: {
    name: string;
    legalName?: string | null | undefined;
    taxId?: string | null | undefined;
    address?: string | null | undefined;
    phone?: string | null | undefined;
    email?: string | null | undefined;
  };
  /** Cliente que assina; ausente em documento de fornecedor. */
  patient?: {
    fullName: string;
    cpf?: string | null | undefined;
    residenceType?: string | null | undefined;
    address?: string | null | undefined;
    addressNumber?: string | null | undefined;
    complement?: string | null | undefined;
    buildingName?: string | null | undefined;
    block?: string | null | undefined;
    floor?: string | null | undefined;
    unit?: string | null | undefined;
    neighborhood?: string | null | undefined;
    city?: string | null | undefined;
    state?: string | null | undefined;
    postalCode?: string | null | undefined;
  };
  plan?: {
    name: string;
    /** Serviços já formatados ("Pilates: 8 sessões, R$ 400,00"). */
    services: string;
    totalValueInCents: number;
    installments: number;
    validFrom: string;
    validUntil?: string | null | undefined;
  };
  professional?: { fullName: string; crefito?: string | null };
  /** Fornecedor que assina (contrato de fornecimento ou prestação de serviço). */
  supplier?: {
    name: string;
    kind: "person" | "company";
    document?: string | null | undefined;
    hiredOn?: string | null | undefined;
    contractAmountInCents?: number | null | undefined;
    billingCycle?: SupplierBillingCycle | null | undefined;
    paymentMethod?: PaymentMethod | null | undefined;
    installments?: number | null | undefined;
    paymentTerms?: string | null | undefined;
  };
  /** Data de emissão já formatada (dd/mm/aaaa). */
  issuedOn: string;
}

function brDate(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function filled(value: string | null | undefined) {
  return value?.trim() || missingDocumentValue;
}

/** "302" e "B" ganham o prefixo ("Apto 302", "Bloco B"); "Torre B" fica como digitado. */
function withPrefix(prefix: string, value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return "";
  return /^\d/.test(text) || text.length <= 2 ? `${prefix} ${text}` : text;
}

/**
 * Detalhes da residência em ordem de leitura: "Ed. Solar, Bloco B, 3º andar, Apto 302"
 * (apartamento), "Cond. Jardins, Quadra 4, Casa 12" (casa em condomínio) ou
 * "Ed. Centro, 5º andar, Sala 504" (comercial).
 */
function residenceDetails(
  patient: NonNullable<DocumentTemplateContext["patient"]>,
) {
  const condominium = patient.residenceType === "condominium";
  const unitPrefix = condominium
    ? "Casa"
    : patient.residenceType === "commercial"
      ? "Sala"
      : "Apto";
  const floor = patient.floor?.trim();
  return [
    withPrefix(condominium ? "Cond." : "Ed.", patient.buildingName),
    withPrefix(condominium ? "Quadra" : "Bloco", patient.block),
    floor ? (/^\d+$/.test(floor) ? `${floor}º andar` : floor) : "",
    withPrefix(unitPrefix, patient.unit),
  ];
}

/**
 * Endereço do cliente em uma linha:
 * "Rua, 120, Ed. Solar, Bloco B, Apto 302, complemento, Bairro, Cidade/UF, CEP 00000-000".
 */
export function formatPatientAddress(
  patient: NonNullable<DocumentTemplateContext["patient"]>,
) {
  const cityState = [patient.city?.trim(), patient.state?.trim()]
    .filter(Boolean)
    .join("/");
  return [
    patient.address?.trim(),
    patient.address?.trim() ? patient.addressNumber?.trim() : "",
    ...residenceDetails(patient),
    patient.complement?.trim(),
    patient.neighborhood?.trim(),
    cityState,
    patient.postalCode?.trim() ? `CEP ${patient.postalCode.trim()}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/** Vigência por extenso: "de 01/11/2026 a 31/01/2027" ou "a partir de …, por prazo indeterminado". */
export function formatPlanValidity(
  validFrom: string,
  validUntil?: string | null,
) {
  return validUntil
    ? `de ${brDate(validFrom)} a ${brDate(validUntil)}`
    : `a partir de ${brDate(validFrom)}, por prazo indeterminado`;
}

const supplierBillingCycleLabels: Record<SupplierBillingCycle, string> = {
  one_time: "valor único",
  monthly: "mensal",
  quarterly: "trimestral",
  yearly: "anual",
};

/** Campos `fornecedor_*`: dados do cadastro do fornecedor (vazios fora desse documento). */
function supplierTemplateValues(
  supplier: DocumentTemplateContext["supplier"],
  currency: Intl.NumberFormat,
) {
  if (!supplier)
    return {
      fornecedor_nome: noSupplierValue,
      fornecedor_documento: noSupplierValue,
      fornecedor_valor: noSupplierValue,
      fornecedor_pagamento: noSupplierValue,
      fornecedor_contratacao: noSupplierValue,
    };
  const document = supplier.document?.replace(/\D/g, "") ?? "";
  const payment = [
    supplier.paymentMethod
      ? `${paymentMethodLabels[supplier.paymentMethod]}${
          (supplier.installments ?? 1) > 1
            ? ` em ${supplier.installments} parcelas`
            : ""
        }`
      : "",
    supplier.paymentTerms?.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    fornecedor_nome: supplier.name,
    fornecedor_documento: document
      ? supplier.kind === "person"
        ? formatCpf(document)
        : formatCnpj(document)
      : missingDocumentValue,
    fornecedor_valor:
      supplier.contractAmountInCents != null
        ? `${currency.format(supplier.contractAmountInCents / 100)} (${
            supplierBillingCycleLabels[supplier.billingCycle ?? "one_time"]
          })`
        : missingDocumentValue,
    fornecedor_pagamento: payment || missingDocumentValue,
    fornecedor_contratacao: supplier.hiredOn
      ? brDate(supplier.hiredOn)
      : missingDocumentValue,
  };
}

/** Valor de cada campo do modelo na emissão (o mesmo cálculo em memória e PostgreSQL). */
export function documentTemplateValues(
  context: DocumentTemplateContext,
): DocumentTemplateValues {
  const { clinic, patient, plan, professional, supplier } = context;
  const currency = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return {
    paciente_nome: patient?.fullName ?? missingDocumentValue,
    paciente_cpf: patient?.cpf ? formatCpf(patient.cpf) : missingDocumentValue,
    paciente_endereco: patient
      ? filled(formatPatientAddress(patient))
      : missingDocumentValue,
    plano_nome: plan?.name ?? noPlanValue,
    plano_servicos: plan?.services || noPlanValue,
    plano_valor: plan
      ? currency.format(plan.totalValueInCents / 100)
      : noPlanValue,
    plano_parcelas: plan ? String(plan.installments) : noPlanValue,
    plano_vigencia: plan
      ? formatPlanValidity(plan.validFrom, plan.validUntil)
      : noPlanValue,
    profissional_nome: professional?.fullName ?? "",
    profissional_crefito: professional?.crefito ?? "",
    ...supplierTemplateValues(supplier, currency),
    data_emissao: context.issuedOn,
    clinica_nome: clinic.name,
    clinica_razao_social: clinic.legalName?.trim() || clinic.name,
    clinica_cnpj: filled(clinic.taxId),
    clinica_endereco: filled(clinic.address),
    clinica_telefone: clinic.phone
      ? formatPhone(clinic.phone)
      : missingDocumentValue,
    clinica_email: filled(clinic.email),
  };
}

/** Substitui cada `{{campo}}` do modelo pelo valor correspondente. */
export function renderDocumentTemplate(
  body: string,
  values: Partial<DocumentTemplateValues>,
): string {
  return documentTemplateVariables.reduce(
    (text, variable) =>
      text.replaceAll(`{{${variable.key}}}`, values[variable.key] ?? ""),
    body,
  );
}

/** Texto do modelo com os campos preenchidos pelos valores de exemplo (prévia). */
export function previewDocumentTemplate(
  body: string,
  overrides: Partial<DocumentTemplateValues> = {},
): string {
  return renderDocumentTemplate(body, {
    ...Object.fromEntries(
      documentTemplateVariables.map((variable) => [
        variable.key,
        variable.example,
      ]),
    ),
    ...overrides,
  });
}

/** Nome sugerido para o modelo padrão de contrato. */
export const defaultContractTemplateName = "Contrato de prestação de serviços";

/**
 * Modelo padrão de contrato de prestação de serviços: identifica as partes (razão social,
 * CNPJ, endereço; nome, CPF e endereço do cliente) e traz objeto, preço, vigência,
 * obrigações, cancelamento (CDC), LGPD, foro, assinaturas e testemunhas (CPC, art. 784, III).
 */
export const defaultContractTemplateBody = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

Pelo presente instrumento particular, as partes abaixo identificadas têm entre si justo e contratado o que segue.

CONTRATADA: {{clinica_razao_social}}, nome fantasia {{clinica_nome}}, inscrita no CNPJ sob o nº {{clinica_cnpj}}, com sede em {{clinica_endereco}}, telefone {{clinica_telefone}}, e-mail {{clinica_email}}.

CONTRATANTE: {{paciente_nome}}, inscrito(a) no CPF sob o nº {{paciente_cpf}}, residente em {{paciente_endereco}}.

CLÁUSULA 1ª – DO OBJETO
1.1. Este contrato tem por objeto a prestação, pela CONTRATADA, dos serviços do plano {{plano_nome}}, compreendendo: {{plano_servicos}}.
1.2. Os atendimentos serão realizados por profissionais habilitados e inscritos no respectivo conselho de classe, nas dependências da CONTRATADA, em dias e horários previamente agendados.

CLÁUSULA 2ª – DO PREÇO E DO PAGAMENTO
2.1. Pelos serviços contratados, o CONTRATANTE pagará à CONTRATADA o valor total de {{plano_valor}}, em {{plano_parcelas}} parcela(s).
2.2. O atraso no pagamento sujeita o CONTRATANTE a multa de 2% (dois por cento) sobre a parcela em atraso e juros de mora de 1% (um por cento) ao mês, nos termos do art. 52, § 1º, do Código de Defesa do Consumidor (Lei nº 8.078/1990).

CLÁUSULA 3ª – DA VIGÊNCIA
3.1. Este contrato vigora {{plano_vigencia}}, podendo ser renovado por acordo entre as partes.

CLÁUSULA 4ª – DAS OBRIGAÇÕES DA CONTRATADA
4.1. Prestar os serviços com zelo, técnica adequada e observância às normas éticas da profissão.
4.2. Registrar os atendimentos em prontuário e mantê-lo sob sigilo pelo prazo legal.
4.3. Informar com antecedência qualquer alteração de horários, profissionais ou condições do serviço.

CLÁUSULA 5ª – DAS OBRIGAÇÕES DO CONTRATANTE
5.1. Efetuar os pagamentos nas datas acordadas.
5.2. Comparecer aos horários agendados e avisar faltas com antecedência mínima de 24 (vinte e quatro) horas; a falta sem aviso poderá ser considerada sessão realizada.
5.3. Informar condições de saúde, uso de medicamentos e restrições médicas relevantes, apresentando atestado quando solicitado.

CLÁUSULA 6ª – DA REPOSIÇÃO E DO CANCELAMENTO
6.1. As faltas avisadas no prazo da cláusula 5.2 poderão ser repostas durante a vigência deste contrato, conforme a disponibilidade da agenda.
6.2. Qualquer das partes poderá rescindir este contrato mediante aviso por escrito. Na rescisão pelo CONTRATANTE, será restituído o valor das sessões não utilizadas, descontada multa de 10% (dez por cento) sobre esse saldo.
6.3. Se a contratação ocorrer fora do estabelecimento da CONTRATADA (por telefone, internet ou aplicativo de mensagens), o CONTRATANTE poderá desistir em até 7 (sete) dias da assinatura, com devolução integral dos valores pagos, conforme o art. 49 do Código de Defesa do Consumidor.

CLÁUSULA 7ª – DA PROTEÇÃO DE DADOS PESSOAIS
7.1. A CONTRATADA tratará os dados pessoais do CONTRATANTE, inclusive os dados de saúde, somente para executar este contrato, tutelar a saúde do CONTRATANTE e cumprir obrigações legais e regulatórias, nos termos da Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018).
7.2. O CONTRATANTE poderá, a qualquer tempo, pedir acesso, correção ou informações sobre o tratamento dos seus dados pelos canais de contato da CONTRATADA.

CLÁUSULA 8ª – DO FORO
8.1. Fica eleito o foro da comarca do domicílio do CONTRATANTE para dirimir as questões oriundas deste contrato, conforme o art. 101, I, do Código de Defesa do Consumidor.

E, por estarem de acordo, as partes assinam este instrumento em 2 (duas) vias de igual teor, na presença de 2 (duas) testemunhas.

______________________________, {{data_emissao}}.


__________________________________________
{{clinica_razao_social}} – CNPJ {{clinica_cnpj}}
CONTRATADA


__________________________________________
{{paciente_nome}} – CPF {{paciente_cpf}}
CONTRATANTE


TESTEMUNHAS:

1. ______________________________ CPF: ________________

2. ______________________________ CPF: ________________`;

export const documentDraftInputSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    content: documentContentSchema,
  })
  .refine(
    (input) => documentContentText(input.content).trim().length >= 20,
    "O conteúdo precisa ter pelo menos 20 caracteres.",
  );

/** Dados compartilhados da assinatura; recibos mantêm o CPF opcional. */
export const publicSignatureInputSchema = z.object({
  signerName: z.string().trim().min(3).max(160),
  signerCpf: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .refine(
      (value) => value === "" || isValidCpf(value),
      "Informe um CPF válido.",
    )
    .optional(),
  accepted: z.literal(true, "Confirme que leu e concorda com o documento."),
  signatureImage: z
    .string()
    .max(700_000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "Desenhe a assinatura."),
});

/** Contratos exigem o CPF válido de quem assina, inclusive em links antigos. */
export const publicDocumentSignInputSchema = publicSignatureInputSchema.extend({
  signerCpf: z
    .string("Informe o CPF de quem assina.")
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .refine(isValidCpf, "Informe um CPF válido de quem assina."),
});

/** Por quantos dias o link de assinatura enviado ao cliente continua abrindo. */
export const signatureLinkValidityDays = 7;

/** Fim da validade de um link gerado em `createdAt`. */
export function signatureLinkExpiresAt(createdAt: string | Date) {
  return new Date(
    new Date(createdAt).getTime() + signatureLinkValidityDays * 86_400_000,
  ).toISOString();
}

/** Link vencido e ainda sem assinatura: não abre nem aceita assinatura. */
export function signatureLinkExpired(
  link: { expiresAt: string; signedAt?: string },
  at: Date = new Date(),
) {
  return !link.signedAt && new Date(link.expiresAt).getTime() <= at.getTime();
}

/** Mensagem de WhatsApp com o link para ler e assinar o contrato. */
export function documentSignatureMessage(input: {
  patientName: string;
  clinicName: string;
  link: string;
  /** Documento de fornecedor: o texto fala do contrato com a clínica, não de plano. */
  supplier?: boolean;
}) {
  const firstName = input.patientName.trim().split(/\s+/)[0] ?? "";
  if (input.supplier)
    return `Olá ${firstName}, a ${input.clinicName} está lhe enviando o contrato firmado entre vocês. Acesse o link abaixo para leitura e assinatura do contrato.\n\n${input.link}`;
  return `Olá ${firstName}, a ${input.clinicName} está lhe enviando o contrato referente ao seu plano de atendimentos/aulas contratado. Acesse o link abaixo para leitura e assinatura do contrato.\n\n${input.link}`;
}
