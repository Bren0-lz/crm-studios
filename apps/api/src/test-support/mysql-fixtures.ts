export const databaseUrl = process.env.TEST_DATABASE_URL;

export const clinicId = "11111111-1111-4111-8111-111111111111";

export const testCpf = "98765432100";

export const duplicateCpf = "12345678062";

export const relationshipCpf = "12345678143";

export const birthdayCpf = "12345678224";

export const satisfactionCpf = "12345678305";

export const timelineCpf = "12345678496";

export const appointmentMarker = "postgres-integration-test";

export const rescheduleMarker = "postgres-reschedule-test";

export const salesMarker = "postgres-sales-test";

export const renewalMarker = "postgres-renewal-test";

export const satisfactionMarker = "postgres-satisfaction-test";

export const timelineMarker = "postgres-timeline-test";

export const leadAppointmentMarker = "postgres-lead-appointment-test";

export const leadAppointmentPhone = "11900001133";

// Mês bem à frente, só com os atendimentos deste teste (comissões e lembretes).
export const leadAppointmentDay = new Date(
  Date.now() + 600 * 24 * 60 * 60 * 1000,
);

export const leadConversionMarker = "postgres-lead-conversion-test";

export const leadConversionPhones = ["11900001144", "11900001155"];

export const leadConversionDay = new Date(
  Date.now() + 610 * 24 * 60 * 60 * 1000,
);

export const trialConversionMarker = "postgres-trial-conversion-test";

export const trialConversionPhones = [
  "11900001166",
  "11900001177",
  "11900001188",
  "11900001199",
  "11900001200",
];

// Dia exclusivo deste teste, para contar as experimentais com valores exatos.
export const trialConversionDay = new Date(
  Date.now() + 620 * 24 * 60 * 60 * 1000,
);

export const ownerId = "22222222-2222-4222-8222-222222222222";

export const recurringPayableMarker = "postgres-recurring-payable-test";

export const dailyCashMarker = "postgres-daily-cash-test";

export const financeClassificationMarker =
  "postgres-finance-classification-test";

export const exportAuditMarker = "postgres-export-audit-test";

export const permissionsUserEmail = "postgres-permissions-test@movimenta.local";

// Dia exclusivo deste teste (aaaa-mm-dd), bem à frente de qualquer movimento real.
export const dailyCashDay = new Date(Date.now() + 640 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
