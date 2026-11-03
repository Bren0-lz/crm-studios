import type { Patient } from "@crm/contracts";

const clinicId = "11111111-1111-4111-8111-111111111111";

/**
 * CPF sintético e válido do cliente demo `number` (PAC-0000N). Base 950.000.000 + N, fora da
 * faixa usada nos testes (`test-support/cpf.ts`, até 900.000.000).
 */
export function demoCpf(number: number): string {
  const digits = String(950_000_000 + number)
    .split("")
    .map(Number);
  for (const weight of [10, 11]) {
    const remainder =
      digits.reduce((sum, digit, index) => sum + digit * (weight - index), 0) %
      11;
    digits.push(remainder < 2 ? 0 : 11 - remainder);
  }
  return digits.join("");
}

/** Um em cada dez clientes demo fica sem CPF, como os importados da planilha (B6-05). */
export const isDemoPatientWithoutCpf = (index: number) => index % 10 === 9;

const firstNames = [
  "Ana",
  "Bruna",
  "Camila",
  "Daniela",
  "Eduarda",
  "Fernanda",
  "Gabriela",
  "Isabela",
  "Juliana",
  "Larissa",
  "Mariana",
  "Natália",
  "Patrícia",
  "Renata",
  "Tatiana",
  "Viviane",
  "André",
  "Bruno",
  "Caio",
  "Daniel",
  "Eduardo",
  "Felipe",
  "Gustavo",
  "Henrique",
  "Igor",
  "João",
  "Leonardo",
  "Marcelo",
  "Pedro",
  "Rafael",
  "Thiago",
  "Vinícius",
  "Alice",
  "Débora",
  "Elaine",
  "Flávia",
  "Lúcia",
  "Marina",
  "Paula",
  "Sandra",
  "Vanessa",
  "Yasmin",
  "Antônio",
  "Carlos",
  "Fábio",
  "Marcos",
  "Otávio",
  "Ricardo",
];
const surnames = [
  "Azevedo",
  "Barbosa",
  "Cardoso",
  "Dias",
  "Ferreira",
  "Gomes",
  "Lima",
  "Machado",
  "Mendes",
  "Moreira",
  "Oliveira",
  "Pereira",
  "Rocha",
  "Santos",
  "Silva",
  "Teixeira",
  "Araújo",
  "Batista",
  "Campos",
  "Castro",
  "Correia",
  "Freitas",
  "Monteiro",
  "Nogueira",
  "Pinto",
  "Ramos",
  "Ribeiro",
  "Souza",
];
// Na lista de nomes, os femininos são os 16 primeiros e "Alice"–"Yasmin" (32–41).
const isFemaleName = (index: number) =>
  index < 16 || (index >= 32 && index < 42);
const femaleRelations = ["mãe", "irmã", "filha", "esposa"];
const maleRelations = ["pai", "irmão", "filho", "marido"];

/** Contato de emergência com parentesco coerente com o nome (V12). */
function emergencyContactFor(index: number, surname: string) {
  const relative = (index * 3 + 11) % firstNames.length;
  const relations = isFemaleName(relative) ? femaleRelations : maleRelations;
  return `${firstNames[relative]} ${surname} (${relations[index % relations.length]})`;
}

/** Dois sobrenomes diferentes, com passos distintos para variar as combinações (V12). */
function surnamesFor(index: number): [string, string] {
  const first = (index * 5 + 3) % surnames.length;
  let second = (index * 11 + 7) % surnames.length;
  if (second === first) second = (second + 1) % surnames.length;
  return [surnames[first]!, surnames[second]!];
}
const specialties = [
  "Fisioterapia",
  "Depilação",
  "Dançaterapia",
  "Pilates",
  "Avaliação funcional",
  "Reabilitação",
  "Massoterapia",
  "Alongamento",
];
const profiles = [
  "Primeira consulta",
  "Recorrente",
  "Pós-operatório",
  "Esportivo",
];
const scenarioTags = [
  ["Dançaterapia", "Frequente", "Assinatura ativa"],
  ["Pilates", "Frequente", "Assinatura ativa"],
  ["Fisioterapia", "Em tratamento"],
  ["Depilação", "Serviço avulso"],
  ["Dançaterapia", "Assinatura cancelada"],
  ["Fisioterapia", "Sem retorno"],
  // "Pagamento atrasado" é automática (QC7): vem das parcelas vencidas do cenário.
  ["Pilates", "Assinatura ativa"],
];
const scenarioNotes = [
  "Participa de dançaterapia duas vezes por semana e mantém o plano ativo.",
  "Frequenta Pilates individual e já possui próximo atendimento agendado.",
  "Segue tratamento fisioterapêutico com sessões disponíveis.",
  "Comprou uma sessão avulsa de depilação.",
  "Frequentava dançaterapia e cancelou a assinatura.",
  "Interrompeu os retornos; o pacote venceu com sessões restantes.",
  "Continua com plano ativo, mas possui parcela vencida.",
];

// IDs and record numbers are stable so repeated PostgreSQL seeding never duplicates records.
export const demoPatients: Patient[] = Array.from(
  { length: 120 },
  (_, index) => {
    const number = index + 4;
    const firstName = firstNames[index % firstNames.length]!;
    const [surname, secondSurname] = surnamesFor(index);
    const fullName = `${firstName} ${surname} ${secondSurname}`;
    const specialty = specialties[index % specialties.length]!;
    const scenario = Math.floor(index / 8);
    const timestamp = new Date(
      // Sempre no passado (2023–2025): data de cadastro futura bagunça o histórico.
      Date.UTC(2023 + (index % 3), index % 12, 2 + (index % 25)),
    ).toISOString();

    return {
      id: `d0000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`,
      clinicId,
      recordNumber: `PAC-${String(number).padStart(5, "0")}`,
      fullName,
      ...(isDemoPatientWithoutCpf(index) ? {} : { cpf: demoCpf(number) }),
      phone: `119${String(90000000 + number).padStart(8, "0")}`,
      ...(index % 5 !== 0 ? { email: `cliente${number}@example.com` } : {}),
      birthDate: `${1950 + ((index * 7) % 55)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
      ...(index % 3 === 0
        ? {
            emergencyContactName: emergencyContactFor(index, secondSurname),
            emergencyContactPhone: `119${String(80000000 + number).padStart(8, "0")}`,
          }
        : {}),
      ...(scenario < scenarioNotes.length
        ? { notes: scenarioNotes[scenario]! }
        : index % 7 === 0
          ? { notes: `Cadastro demonstrativo para ${specialty.toLowerCase()}.` }
          : {}),
      tags:
        scenario < scenarioTags.length
          ? [...scenarioTags[scenario]!]
          : [specialty, profiles[index % profiles.length]!],
      status: index >= 56 && index % 9 === 8 ? "inactive" : "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  },
);
