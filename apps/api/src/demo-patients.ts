import type { Patient } from "@crm/contracts";

const clinicId = "11111111-1111-4111-8111-111111111111";

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
];
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
  ["Pilates", "Pagamento atrasado"],
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
    const surname =
      surnames[Math.floor(index / firstNames.length) % surnames.length]!;
    const secondSurname = surnames[(index * 7 + 5) % surnames.length]!;
    const fullName = `${firstName} ${surname} ${secondSurname}`;
    const specialty = specialties[index % specialties.length]!;
    const scenario = Math.floor(index / 8);
    const timestamp = new Date(
      Date.UTC(2024 + (index % 3), index % 12, 2 + (index % 25)),
    ).toISOString();

    return {
      id: `d0000000-0000-4000-8000-${number.toString(16).padStart(12, "0")}`,
      clinicId,
      recordNumber: `PAC-${String(number).padStart(5, "0")}`,
      fullName,
      phone: `119${String(90000000 + number).padStart(8, "0")}`,
      ...(index % 5 !== 0 ? { email: `cliente${number}@example.com` } : {}),
      birthDate: `${1950 + ((index * 7) % 55)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
      ...(index % 3 === 0
        ? {
            emergencyContactName: `Contato fictício ${number}`,
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
