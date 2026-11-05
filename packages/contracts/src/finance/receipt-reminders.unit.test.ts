import { describe, expect, it } from "vitest";
import {
  defaultReceiptReminderSettings,
  isReceiptReminderDue,
  receiptReminderSettingsSchema,
  resolveReceiptReminderSettings,
  unsignedReceiptPatientCount,
} from "./receipt-reminders.js";

const timeZone = "America/Sao_Paulo";

describe("aviso de recibos não assinados", () => {
  it("usa o padrão provisório (diário às 18:00) no que não foi configurado", () => {
    expect(defaultReceiptReminderSettings).toEqual({
      frequency: "daily",
      weekday: 1,
      time: "18:00",
      afterHours: 24,
    });
    expect(resolveReceiptReminderSettings(null)).toEqual(
      defaultReceiptReminderSettings,
    );
    expect(
      resolveReceiptReminderSettings({ time: "09:30", afterHours: "x" }),
    ).toEqual({ ...defaultReceiptReminderSettings, time: "09:30" });
  });

  it("valida horário, frequência e horas", () => {
    const valid = {
      frequency: "weekly",
      weekday: 5,
      time: "08:05",
      afterHours: 48,
    };
    expect(receiptReminderSettingsSchema.parse(valid)).toEqual(valid);
    for (const invalid of [
      { ...valid, time: "24:00" },
      { ...valid, time: "8:00" },
      { ...valid, frequency: "hourly" },
      { ...valid, weekday: 7 },
      { ...valid, afterHours: 0 },
      { ...valid, afterHours: 721 },
    ])
      expect(receiptReminderSettingsSchema.safeParse(invalid).success).toBe(
        false,
      );
  });

  it("vale do horário configurado até o fim do dia, no fuso da clínica", () => {
    const daily = defaultReceiptReminderSettings;
    // 17:59 e 18:00 em São Paulo (UTC-3).
    expect(
      isReceiptReminderDue(daily, new Date("2039-06-10T20:59:00Z"), timeZone),
    ).toBe(false);
    expect(
      isReceiptReminderDue(daily, new Date("2039-06-10T21:00:00Z"), timeZone),
    ).toBe(true);
    // 23:59 ainda vale; 00:30 do dia seguinte espera o novo horário.
    expect(
      isReceiptReminderDue(daily, new Date("2039-06-11T02:59:00Z"), timeZone),
    ).toBe(true);
    expect(
      isReceiptReminderDue(daily, new Date("2039-06-11T03:30:00Z"), timeZone),
    ).toBe(false);
    expect(
      isReceiptReminderDue(
        { ...daily, frequency: "off" },
        new Date("2039-06-10T22:00:00Z"),
        timeZone,
      ),
    ).toBe(false);
  });

  it("no semanal, só no dia escolhido", () => {
    // 10/06/2039 é sexta-feira.
    const weekly = {
      ...defaultReceiptReminderSettings,
      frequency: "weekly" as const,
      weekday: 5,
      time: "09:00",
    };
    expect(
      isReceiptReminderDue(weekly, new Date("2039-06-10T12:00:00Z"), timeZone),
    ).toBe(true);
    expect(
      isReceiptReminderDue(
        { ...weekly, weekday: 4 },
        new Date("2039-06-10T12:00:00Z"),
        timeZone,
      ),
    ).toBe(false);
  });

  it("conta clientes com recibo enviado há mais de N horas e sem assinatura", () => {
    const now = new Date("2039-06-10T21:00:00Z");
    expect(
      unsignedReceiptPatientCount(
        [
          // Duas parcelas do mesmo cliente contam uma vez.
          {
            patientId: "a",
            receiptSignature: {
              status: "sent",
              sentAt: "2039-06-09T20:00:00Z",
            },
          },
          {
            patientId: "a",
            receiptSignature: {
              status: "viewed",
              sentAt: "2039-06-08T20:00:00Z",
              firstViewedAt: "2039-06-09T10:00:00Z",
            },
          },
          // Exatamente 24 horas conta.
          {
            patientId: "b",
            receiptSignature: {
              status: "sent",
              sentAt: "2039-06-09T21:00:00Z",
            },
          },
          // Enviado há menos de 24 horas, assinado, só gerado ou sem recibo: fora.
          {
            patientId: "c",
            receiptSignature: {
              status: "sent",
              sentAt: "2039-06-10T12:00:00Z",
            },
          },
          {
            patientId: "d",
            receiptSignature: {
              status: "signed",
              sentAt: "2039-06-01T12:00:00Z",
              signedAt: "2039-06-02T12:00:00Z",
            },
          },
          { patientId: "e", receiptSignature: { status: "generated" } },
          { patientId: "f" },
          // Aberto pelo link sem o clique de envio: conta da 1ª visualização.
          {
            patientId: "g",
            receiptSignature: {
              status: "viewed",
              firstViewedAt: "2039-06-01T12:00:00Z",
            },
          },
        ],
        24,
        now,
      ),
    ).toBe(3);
  });
});
