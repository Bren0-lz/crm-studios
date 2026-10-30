import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: pró-labore e caixa do período`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("prolabore");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("mantém o padrão e grava o pró-labore", async () => {
        expect(await repository.getProLaboreSettings(clinicId)).toEqual({
          percentage: 0,
          base: "profit",
        });
        const saved = await repository.updateProLaboreSettings(
          clinicId,
          actorId,
          { percentage: 12.5, base: "revenue" },
        );
        expect(saved).toMatchObject({ percentage: 12.5, base: "revenue" });
        expect(saved.updatedAt).toBeTruthy();
        expect(await repository.getProLaboreSettings(clinicId)).toMatchObject({
          percentage: 12.5,
          base: "revenue",
        });
      });

      it("lista os movimentos do caixa no período com a origem", async () => {
        const category = await repository.createFinancialCategory(clinicId, {
          name: "Energia",
          kind: "expense",
        });
        const payable = await repository.createPayable(clinicId, actorId, {
          description: "Conta de luz do período",
          categoryId: category.id,
          dueDate: "2031-03-10",
          amountInCents: 3_000,
        });
        await repository.settlePayable(clinicId, actorId, payable.id, "pix", {
          paidAt: "2031-03-10T15:00:00.000Z",
          availableAt: "2031-03-10T15:00:00.000Z",
        });
        const movements = await repository.listCashMovements(
          clinicId,
          "2031-03-01",
          "2031-03-31",
        );
        expect(
          movements.filter((item) => item.payableId === payable.id),
        ).toEqual([
          expect.objectContaining({
            kind: "payable",
            direction: "out",
            amountInCents: 3_000,
            paymentMethod: "pix",
          }),
        ]);
        expect(
          await repository.listCashMovements(
            clinicId,
            "2031-04-01",
            "2031-04-30",
          ),
        ).toEqual(
          expect.not.arrayContaining([
            expect.objectContaining({ payableId: payable.id }),
          ]),
        );
      });
    },
  );
}
