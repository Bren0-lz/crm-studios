import type { CommissionEntry, Payable, ReceivedPayment } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { buildDailyCash } from "./daily-cash.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

function receipt(
  id: string,
  occurredAt: string,
  amountInCents: number,
  extra: Partial<ReceivedPayment> = {},
): ReceivedPayment {
  return {
    id,
    receivableId: "rec-1",
    kind: "payment",
    occurredAt,
    patientId: "patient-1",
    patientName: "Ana",
    description: "Pacote Pilates 1/1",
    amountInCents,
    paymentMethod: "pix",
    ...extra,
  };
}

/** Estorno: não registra forma de pagamento. */
function reversal(
  id: string,
  occurredAt: string,
  amountInCents: number,
  receivableId = "rec-1",
): ReceivedPayment {
  const item = receipt(id, occurredAt, amountInCents, {
    kind: "reversal",
    receivableId,
  });
  delete item.paymentMethod;
  return item;
}

function payable(
  id: string,
  paidAt: string | undefined,
  amountInCents: number,
  extra: Partial<Payable> = {},
): Payable {
  return {
    id,
    clinicId,
    description: "Aluguel",
    supplier: "Imobiliária",
    categoryId: "c1",
    costCenterId: "cc1",
    categoryName: "Despesas",
    costCenterName: "Administrativo",
    dueDate: "2026-10-05",
    amountInCents,
    status: paidAt ? "paid" : "open",
    ...(paidAt ? { paidAt, paymentMethod: "bank_transfer" as const } : {}),
    overdue: false,
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    ...extra,
  };
}

function commission(
  id: string,
  paidAt: string | undefined,
  amountInCents: number,
): CommissionEntry {
  return {
    id,
    clinicId,
    professionalId: "prof-1",
    professionalName: "Bia",
    appointmentId: `appointment-${id}`,
    competence: "2026-09",
    baseAmountInCents: amountInCents * 2,
    percentage: 50,
    amountInCents,
    status: paidAt ? "paid" : "open",
    ...(paidAt ? { paidAt } : {}),
    createdAt: "2026-10-01T12:00:00.000Z",
  };
}

describe("daily cash", () => {
  it("groups inflows and outflows of the clinic day by payment method", () => {
    const cash = buildDailyCash(
      "2026-10-10",
      {
        receipts: [
          receipt("r1", "2026-10-10T12:00:00.000Z", 10_000),
          receipt("r2", "2026-10-10T14:00:00.000Z", 5_000, {
            receivableId: "rec-2",
            paymentMethod: "card",
          }),
          // Outro dia: fora.
          receipt("r3", "2026-10-09T12:00:00.000Z", 7_000),
        ],
        payables: [
          payable("p1", "2026-10-10T13:00:00.000Z", 3_000),
          payable("p2", "2026-10-10T13:30:00.000Z", 1_000, {
            paymentMethod: "pix",
          }),
          payable("p3", undefined, 9_999),
          payable("p4", "2026-10-11T13:00:00.000Z", 9_999),
        ],
        commissions: [
          commission("c1", "2026-10-10T20:00:00.000Z", 2_000),
          commission("c2", undefined, 9_999),
        ],
      },
      "America/Sao_Paulo",
      new Date("2026-10-10T21:00:00.000Z"),
    );
    expect(cash).toMatchObject({
      date: "2026-10-10",
      generatedAt: "2026-10-10T21:00:00.000Z",
      totalInflowInCents: 15_000,
      totalOutflowInCents: 6_000,
      balanceInCents: 9_000,
      byPaymentMethod: [
        {
          paymentMethod: "pix",
          inflowInCents: 10_000,
          outflowInCents: 1_000,
          balanceInCents: 9_000,
        },
        {
          paymentMethod: "card",
          inflowInCents: 5_000,
          outflowInCents: 0,
          balanceInCents: 5_000,
        },
        {
          paymentMethod: "bank_transfer",
          inflowInCents: 0,
          outflowInCents: 3_000,
          balanceInCents: -3_000,
        },
        {
          paymentMethod: "unspecified",
          inflowInCents: 0,
          outflowInCents: 2_000,
          balanceInCents: -2_000,
        },
      ],
    });
    expect(cash.movements.map((item) => item.id)).toEqual([
      "receipt:r1",
      "payable:p1",
      "payable:p2",
      "receipt:r2",
      "commission:c1",
    ]);
    expect(cash.movements.find((item) => item.kind === "commission")).toEqual({
      id: "commission:c1",
      kind: "commission",
      direction: "out",
      occurredAt: "2026-10-10T20:00:00.000Z",
      description: "Comissão 2026-09",
      counterpart: "Bia",
      paymentMethod: "unspecified",
      amountInCents: 2_000,
    });
  });

  it("uses the event date in the clinic time zone", () => {
    // 23h30 em São Paulo do dia 10 = 02h30 UTC do dia 11.
    const late = "2026-10-11T02:30:00.000Z";
    const sources = {
      receipts: [receipt("r1", late, 4_000)],
      payables: [payable("p1", late, 1_500)],
      commissions: [commission("c1", late, 500)],
    };
    const day = buildDailyCash("2026-10-10", sources);
    expect(day.movements).toHaveLength(3);
    expect(day).toMatchObject({
      totalInflowInCents: 4_000,
      totalOutflowInCents: 2_000,
      balanceInCents: 2_000,
    });
    const next = buildDailyCash("2026-10-11", sources);
    expect(next.movements).toEqual([]);
  });

  it("subtracts reversals in the method of the payment they reverse", () => {
    const cash = buildDailyCash("2026-10-12", {
      receipts: [
        receipt("pay-1", "2026-10-10T12:00:00.000Z", 8_000, {
          paymentMethod: "cash",
        }),
        reversal("rev-1", "2026-10-12T12:00:00.000Z", -8_000),
        // Estorno sem pagamento conhecido: forma não especificada.
        reversal("rev-2", "2026-10-12T13:00:00.000Z", -1_000, "rec-unknown"),
        receipt("pay-2", "2026-10-12T15:00:00.000Z", 3_000, {
          receivableId: "rec-3",
          paymentMethod: "cash",
        }),
      ],
      payables: [],
      commissions: [],
    });
    expect(
      cash.movements.map((item) => [item.kind, item.amountInCents]),
    ).toEqual([
      ["receipt_reversal", -8_000],
      ["receipt_reversal", -1_000],
      ["receipt", 3_000],
    ]);
    expect(cash.byPaymentMethod).toEqual([
      {
        paymentMethod: "cash",
        inflowInCents: -5_000,
        outflowInCents: 0,
        balanceInCents: -5_000,
      },
      {
        paymentMethod: "unspecified",
        inflowInCents: -1_000,
        outflowInCents: 0,
        balanceInCents: -1_000,
      },
    ]);
    expect(cash).toMatchObject({
      totalInflowInCents: -6_000,
      totalOutflowInCents: 0,
      balanceInCents: -6_000,
    });
  });

  it("returns an empty cash for a day without movement", () => {
    const cash = buildDailyCash("2026-10-15", {
      receipts: [receipt("r1", "2026-10-10T12:00:00.000Z", 1_000)],
      payables: [payable("p1", "2026-10-14T12:00:00.000Z", 1_000)],
      commissions: [],
    });
    expect(cash).toMatchObject({
      date: "2026-10-15",
      byPaymentMethod: [],
      totalInflowInCents: 0,
      totalOutflowInCents: 0,
      balanceInCents: 0,
      movements: [],
    });
  });
});
