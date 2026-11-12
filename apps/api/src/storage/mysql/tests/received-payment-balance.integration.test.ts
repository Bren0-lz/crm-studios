import { patientInputSchema } from "@crm/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import { nextTestCpf } from "../../../test-support/cpf.js";
import { OWNER_ID } from "../../../test-support/legacy-fixtures.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";

const clinicId = "11111111-1111-4111-8111-111111111111";

// Histórico de pagamentos do painel (PX6): a baixa parcial aponta para a cobrança do saldo.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: saldo da baixa parcial nos recebimentos`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("rcvbalance");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("links the partial payment to the balance receivable and leaves full payments and reversals without it", async () => {
        const patient = await repository.createPatient(
          clinicId,
          patientInputSchema.parse({
            fullName: "Cliente do saldo",
            cpf: nextTestCpf(),
            phone: "11955554444",
            whatsapp: "11955554444",
            emergencyContactName: "Cliente do saldo",
            emergencyContactPhone: "11955554444",
            emergencyContactWhatsapp: "11955554444",
          }),
        );
        const charge = (description: string) =>
          repository.createManualReceivable(clinicId, OWNER_ID, {
            patientId: patient.id,
            description,
            amountInCents: 10_000,
            dueDate: "2020-03-10",
          });
        const partial = await charge("Parcial");
        const full = await charge("Inteira");
        await repository.settleReceivable(
          clinicId,
          OWNER_ID,
          partial.id,
          "cash",
          { paidAt: "2020-03-10T15:00:00.000Z" },
          { receivedInCents: 4_000 },
        );
        await repository.settleReceivable(clinicId, OWNER_ID, full.id, "pix", {
          paidAt: "2020-03-11T15:00:00.000Z",
        });
        await repository.reverseReceivablePayment(clinicId, OWNER_ID, full.id);

        const balance = (await repository.getFinancialSummary(clinicId))
          .receivables.find(
            (item) =>
              item.patientId === patient.id &&
              item.id !== partial.id &&
              item.id !== full.id,
          );
        expect(balance).toMatchObject({ status: "open", amountInCents: 6_000 });
        const events = (
          await repository.listReceivedPayments(
            clinicId,
            "1900-01-01",
            "9999-12-31",
          )
        ).filter((item) => item.patientId === patient.id);
        expect(
          events.map(({ receivableId, kind, amountInCents, balanceReceivableId }) => ({
            receivableId,
            kind,
            amountInCents: Math.abs(amountInCents),
            balanceReceivableId,
          })),
        ).toEqual([
          {
            receivableId: partial.id,
            kind: "payment",
            amountInCents: 4_000,
            balanceReceivableId: balance!.id,
          },
          {
            receivableId: full.id,
            kind: "payment",
            amountInCents: 10_000,
            balanceReceivableId: undefined,
          },
          {
            receivableId: full.id,
            kind: "reversal",
            amountInCents: 10_000,
            balanceReceivableId: undefined,
          },
        ]);
      });
    },
  );
}
