import { describe, expect, it } from "vitest";
import {
  publicReceiptSignatureStatus,
  receiptSignatureStatus,
} from "./receipt-signatures.js";

describe("situação do recibo para assinatura", () => {
  it("segue gerado → enviado → visualizado → assinado", () => {
    expect(receiptSignatureStatus({ viewCount: 0 })).toBe("generated");
    expect(
      receiptSignatureStatus({ viewCount: 0, sentAt: "2026-11-01T12:00:00Z" }),
    ).toBe("sent");
    expect(
      receiptSignatureStatus({ viewCount: 2, sentAt: "2026-11-01T12:00:00Z" }),
    ).toBe("viewed");
    expect(
      receiptSignatureStatus({
        viewCount: 2,
        signedAt: "2026-11-01T13:00:00Z",
      }),
    ).toBe("signed");
  });

  it("cancelado vale mesmo depois de assinado", () => {
    expect(
      receiptSignatureStatus({
        viewCount: 1,
        signedAt: "2026-11-01T13:00:00Z",
        cancelledAt: "2026-11-02T09:00:00Z",
      }),
    ).toBe("cancelled");
  });

  it("no link público: pendente, assinado ou cancelado", () => {
    expect(publicReceiptSignatureStatus({})).toBe("pending");
    expect(
      publicReceiptSignatureStatus({ signedAt: "2026-11-01T13:00:00Z" }),
    ).toBe("signed");
    expect(
      publicReceiptSignatureStatus({
        signedAt: "2026-11-01T13:00:00Z",
        cancelledAt: "2026-11-02T09:00:00Z",
      }),
    ).toBe("cancelled");
  });
});
