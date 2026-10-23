import { z } from "zod";
import { formatCpf, formatPhone } from "../common/model.js";

export const documentKindSchema = z.enum([
  "contract",
  "attendance_declaration",
  "consent",
  "other",
]);

export const documentTemplateInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  kind: documentKindSchema,
  body: z.string().trim().min(20).max(20_000),
});

export const documentTemplateVersionInputSchema = z.object({
  body: z.string().trim().min(20).max(20_000),
});

export const issuedDocumentInputSchema = z.object({
  templateId: z.uuid(),
  patientId: z.uuid(),
  planId: z.uuid().optional(),
  professionalId: z.uuid().optional(),
  title: z.string().trim().min(3).max(160),
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
export const documentTemplateVariables = [
  { key: "paciente_nome", label: "Nome do cliente", example: "Maria da Silva" },
  { key: "paciente_cpf", label: "CPF do cliente", example: "529.982.247-25" },
  {
    key: "paciente_endereco",
    label: "Endereço do cliente",
    example: "Rua das Flores, 120, Centro, Campinas/SP, CEP 13010-000",
  },
  { key: "plano_nome", label: "Plano", example: "Pilates 2x por semana" },
  {
    key: "plano_servicos",
    label: "Serviços do plano",
    example: "Pilates (8 sessões)",
  },
  { key: "plano_valor", label: "Valor do plano", example: "R$ 1.200,00" },
  { key: "plano_parcelas", label: "Parcelas do plano", example: "3" },
  {
    key: "plano_vigencia",
    label: "Vigência do plano",
    example: "de 01/11/2026 a 31/01/2027",
  },
  {
    key: "profissional_nome",
    label: "Profissional",
    example: "Beatriz Lima",
  },
  {
    key: "profissional_crefito",
    label: "CREFITO do profissional",
    example: "CREFITO-3 223344-F",
  },
  { key: "data_emissao", label: "Data de hoje", example: "17/10/2026" },
  { key: "clinica_nome", label: "Nome da clínica", example: "Studios Aryana" },
  {
    key: "clinica_razao_social",
    label: "Razão social",
    example: "Studios Aryana Ltda.",
  },
  { key: "clinica_cnpj", label: "CNPJ", example: "11.222.333/0001-81" },
  {
    key: "clinica_endereco",
    label: "Endereço da clínica",
    example: "Av. Brasil, 500, sala 12, Campinas/SP",
  },
  {
    key: "clinica_telefone",
    label: "Telefone da clínica",
    example: "(19) 99999-0000",
  },
  {
    key: "clinica_email",
    label: "E-mail da clínica",
    example: "contato@studiosaryana.com.br",
  },
] as const;

export type DocumentTemplateVariable =
  (typeof documentTemplateVariables)[number]["key"];

export type DocumentTemplateValues = Record<DocumentTemplateVariable, string>;

/** Texto usado quando o cadastro não tem o dado pedido pelo modelo. */
export const missingDocumentValue = "não informado";

const noPlanValue = "Não vinculado";

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
  patient: {
    fullName: string;
    cpf?: string | null | undefined;
    address?: string | null | undefined;
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

/** Endereço do cliente em uma linha: "Rua, Bairro, Cidade/UF, CEP 00000-000". */
export function formatPatientAddress(
  patient: DocumentTemplateContext["patient"],
) {
  const cityState = [patient.city?.trim(), patient.state?.trim()]
    .filter(Boolean)
    .join("/");
  return [
    patient.address?.trim(),
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

/** Valor de cada campo do modelo na emissão (o mesmo cálculo em memória e PostgreSQL). */
export function documentTemplateValues(
  context: DocumentTemplateContext,
): DocumentTemplateValues {
  const { clinic, patient, plan, professional } = context;
  const currency = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return {
    paciente_nome: patient.fullName,
    paciente_cpf: patient.cpf ? formatCpf(patient.cpf) : missingDocumentValue,
    paciente_endereco: filled(formatPatientAddress(patient)),
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
