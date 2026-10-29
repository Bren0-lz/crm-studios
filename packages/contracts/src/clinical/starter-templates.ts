import type { AssessmentField, AssessmentTemplateInput } from "./types.js";

const text = (key: string, label: string): AssessmentField => ({
  key,
  label,
  type: "text",
  required: false,
});
const longText = (key: string, label: string): AssessmentField => ({
  key,
  label,
  type: "long_text",
  required: false,
});
const section = (key: string, label: string): AssessmentField => ({
  key,
  label,
  type: "section",
  required: false,
});

/**
 * Formulários que toda clínica recebe pronta para usar (fichas em papel que o estúdio já
 * usava). Viram modelos comuns: podem ser editados, versionados, duplicados e arquivados.
 * A migração 0101 grava o mesmo conteúdo no PostgreSQL — mantenha os dois iguais.
 */
export const starterAssessmentTemplates: AssessmentTemplateInput[] = [
  {
    name: "Anamnese",
    specialty: "Fisioterapia",
    status: "published",
    fields: [
      longText("objetivo", "Objetivo"),
      {
        key: "atividades",
        label: "Pratica atividades físicas?",
        type: "select",
        options: ["Sim", "Não", "Passado"],
        required: false,
      },
      text("atividades_quais", "Quais atividades?"),
      longText("queixa_principal", "Queixa principal"),
      longText("queixa_secundaria", "Queixa secundária"),
      longText("diagnostico_medico", "Diagnóstico médico"),
      longText("historia_pregressa", "História pregressa de doenças"),
      longText("avaliacao_postural", "Avaliação postural"),
      longText("forca_muscular", "Força muscular"),
      longText("amplitude_movimento", "Amplitude do movimento"),
      longText("perimetria_exames", "Perimetria/exames"),
      longText("alergias_cirurgias", "Alergias/cirurgias"),
      longText("medicamentos", "Medicamentos em uso"),
      longText("historico_familiar", "Histórico familiar"),
      longText("restricoes", "Restrições"),
      longText("observacoes_gerais", "Observações gerais"),
    ],
  },
  {
    name: "Avaliação postural",
    specialty: "Fisioterapia",
    status: "published",
    fields: [
      section("secao_fisico", "Físico-corporal"),
      text("pressao_arterial", "Pressão arterial"),
      {
        key: "peso",
        label: "Peso corporal",
        type: "number",
        unit: "kg",
        min: 0,
        required: false,
      },
      {
        key: "altura",
        label: "Altura",
        type: "number",
        unit: "m",
        min: 0,
        max: 3,
        required: false,
      },
      section("secao_anterior", "Vista anterior"),
      text("anterior_cabeca", "Cabeça"),
      text("anterior_ombros", "Altura dos ombros"),
      text("anterior_maos", "Altura das mãos"),
      text("anterior_rotacao_tronco", "Rotação do tronco"),
      text("anterior_angulo_tales", "Ângulo de Tales"),
      text("anterior_cicatriz_umbilical", "Cicatriz umbilical"),
      text("anterior_crista_iliaca", "Altura da crista ilíaca"),
      text("anterior_joelhos", "Joelhos"),
      longText("anterior_observacoes", "Observações da vista anterior"),
      section("secao_posterior", "Vista posterior"),
      text("posterior_escapulas", "Altura das escápulas"),
      text("posterior_escapulas_aladas", "Escápulas aladas"),
      text("posterior_cervical", "Coluna cervical"),
      text("posterior_toracica", "Coluna torácica"),
      text("posterior_lombar", "Coluna lombar"),
      longText("posterior_observacoes", "Observações da vista posterior"),
      section("secao_lateral", "Vista lateral"),
      text("lateral_cabeca", "Cabeça"),
      text("lateral_cervical", "Cervical"),
      text("lateral_ombros", "Ombros"),
      text("lateral_toracica", "Coluna torácica"),
      text("lateral_lombar", "Coluna lombar"),
      text("lateral_abdomen", "Abdômen"),
      text("lateral_pelve", "Pelve"),
      text("lateral_joelhos", "Joelhos"),
      section("secao_observacoes", "Conclusão"),
      longText("observacoes_gerais", "Observações gerais"),
    ],
  },
  {
    name: "Ficha de inscrição — Dançaterapia e Aula de Ritmos",
    specialty: "Dançaterapia",
    status: "published",
    fields: [
      {
        key: "objetivos",
        label: "Qual é o seu principal objetivo com as aulas?",
        type: "multiselect",
        options: [
          "Melhorar a mobilidade",
          "Praticar uma atividade física",
          "Reduzir o estresse e a ansiedade",
          "Trabalhar a coordenação e o equilíbrio",
          "Socializar e conhecer novas pessoas",
          "Dançar e se divertir",
        ],
        required: false,
      },
      text("objetivo_outro", "Outro objetivo"),
      longText(
        "saude",
        "Possui alguma dor, problema de saúde ou doença preexistente?",
      ),
      longText(
        "cirurgias_lesoes",
        "Já realizou alguma cirurgia ou teve alguma lesão importante?",
      ),
      longText(
        "limitacoes",
        "Existe alguma limitação ou informação importante que eu precise saber antes das aulas?",
      ),
    ],
  },
];
