import { clinicSettingsInputSchema } from "@crm/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";

// RF11 (D3): alcance padrão do desconto do plano, gravado nas configurações da clínica.
for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: alcance padrão do desconto`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("discscope");
        repository = new MysqlClinicRepository(database.pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      // O schema descarta `id` e `updatedAt` da leitura.
      const settingsInput = async (change: Record<string, unknown> = {}) =>
        clinicSettingsInputSchema.parse({
          ...(await repository.getClinicSettings(clinicId))!,
          ...change,
        });

      it("começa em “só no próximo pagamento”, grava e mantém quando ausente", async () => {
        expect(
          (await repository.getClinicSettings(clinicId))?.defaultDiscountScope,
        ).toBe("once");

        const saved = await repository.updateClinicSettings(
          clinicId,
          actorId,
          await settingsInput({ defaultDiscountScope: "next" }),
        );
        expect(saved.defaultDiscountScope).toBe("next");
        expect(
          (await repository.getClinicSettings(clinicId))?.defaultDiscountScope,
        ).toBe("next");

        // Sem o campo (ex.: tela antiga), o alcance gravado continua.
        const withoutScope = await settingsInput({
          name: "Clínica sem alcance no envio",
        });
        delete withoutScope.defaultDiscountScope;
        const kept = await repository.updateClinicSettings(
          clinicId,
          actorId,
          withoutScope,
        );
        expect(kept.name).toBe("Clínica sem alcance no envio");
        expect(kept.defaultDiscountScope).toBe("next");

        await repository.updateClinicSettings(
          clinicId,
          actorId,
          await settingsInput({ defaultDiscountScope: "permanent" }),
        );
        expect(
          (await repository.getClinicSettings(clinicId))?.defaultDiscountScope,
        ).toBe("permanent");
      });
    },
  );
}
