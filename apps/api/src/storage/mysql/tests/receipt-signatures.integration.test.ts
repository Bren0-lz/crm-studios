import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import {
  receiptFixtures,
  receiptActorId,
  receiptClinicId,
  verifyPaidSaleReceipt,
  verifyReceiptLifecycle,
  verifyReceiptSigning,
  verifyReceiptTracking,
} from "../../../test-support/receipt-signatures-suite.js";

// Recibo para assinatura (RC1): mesma regra nos dois armazenamentos.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: recibo para assinatura`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("receipts");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("gera o recibo na baixa, cancela no estorno e gera outro na nova baixa", async () => {
        await verifyReceiptLifecycle(repository);
      });

      it("assina uma vez e emite receipt.signed depois do commit", async () => {
        await verifyReceiptSigning(repository);
      });

      it("lista a situação do recibo e mostra envio, visualização e assinatura no histórico", async () => {
        await verifyReceiptTracking(repository);
      });

      it("gera e cancela o recibo da venda paga no balcão", async () => {
        await verifyPaidSaleReceipt(repository);
      });

      it.skipIf(storage === "memory")(
        "aplica os CHECKs da tabela (token curto, assinatura sem imagem, cancelamento sem motivo)",
        async () => {
          const { receivable } = await receiptFixtures(repository);
          await repository.settleReceivable(
            receiptClinicId,
            receiptActorId,
            receivable.id,
            "pix",
          );
          const [receipt] = await repository.listReceiptSignatures(
            receiptClinicId,
            receivable.id,
          );
          await expect(
            pool!.query(
              "UPDATE receipt_signatures SET token = 'curto' WHERE id = $1",
              [receipt!.id],
            ),
          ).rejects.toThrow();
          await expect(
            pool!.query(
              `UPDATE receipt_signatures SET signed_at = NOW(6), signature = '{"signerName":"X"}'
                WHERE id = $1`,
              [receipt!.id],
            ),
          ).rejects.toThrow();
          await expect(
            pool!.query(
              "UPDATE receipt_signatures SET cancelled_at = NOW(6) WHERE id = $1",
              [receipt!.id],
            ),
          ).rejects.toThrow();
        },
      );
    },
  );
}
