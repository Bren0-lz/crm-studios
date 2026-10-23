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
