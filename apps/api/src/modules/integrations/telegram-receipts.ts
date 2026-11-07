import type { ReceiptSignedEvent } from "../../infrastructure/domain-events.js";
import type { ClinicRepository } from "../../repository.js";
import { DEFAULT_CLINIC_TIMEZONE } from "../finance/daily-cash.js";
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
    const paidOn = new Intl.DateTimeFormat("pt-BR", {
      timeZone: settings?.timezone ?? DEFAULT_CLINIC_TIMEZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(event.paidAt));
    await telegram.notifyLinkedChats(
      event.clinicId,
      `Recibo assinado: ${patient.fullName} · ${currency.format(event.amountInCents / 100)} · pago em ${paidOn}`,
    );
  };
}
