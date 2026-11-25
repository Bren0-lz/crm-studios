import type { ReceiptSignedEvent } from "../../infrastructure/domain-events.js";
import type { ClinicRepository } from "../../repository.js";
import { DEFAULT_CLINIC_TIMEZONE } from "../finance/daily-cash.js";
import { telegramClock, telegramCpf } from "./telegram-messages.js";
import type { TelegramService } from "./telegram.js";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/** Consumidor de `receipt.signed`: só roda depois do commit da assinatura. */
export function createReceiptSignedTelegramHandler({
  repository,
  telegram,
}: {
  repository: Pick<ClinicRepository, "getPatient" | "getClinicSettings">;
  telegram: TelegramService;
}) {
  return async (event: ReceiptSignedEvent) => {
    if (!telegram.enabled) return;
    const [patient, settings] = await Promise.all([
      repository.getPatient(event.clinicId, event.patientId),
      repository.getClinicSettings(event.clinicId),
    ]);
    if (!patient) return;
    const clock = telegramClock(settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE);
    await telegram.notifyLinkedChats(event.clinicId, "receipts", [
      [
        "Recibo assinado",
        "",
        `Cliente: ${patient.fullName}`,
        telegramCpf(patient.cpf),
        `Valor pago: ${currency.format(event.amountInCents / 100)}`,
        `Pago em ${clock.day(new Date(event.paidAt))}`,
      ].join("\n"),
    ]);
  };
}
