import { automaticPatientTagDefinitions } from "@crm/contracts";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111";
const adminId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: nome e cor das etiquetas automáticas (AT1)`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("autotags");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("parte do padrão, grava nome e cor, mantém o que não veio e restaura", async () => {
        const defaults = await repository.listAutomaticPatientTags(clinicId);
        expect(defaults.map((tag) => tag.key)).toEqual(
          automaticPatientTagDefinitions.map((tag) => tag.key),
        );
        expect(defaults.every((tag) => tag.name === tag.defaultName)).toBe(
          true,
        );
        expect(defaults.every((tag) => !tag.customized)).toBe(true);

        const renamed = await repository.updateAutomaticPatientTag(
          clinicId,
          adminId,
          "missing_email",
          { name: "Falta e-mail", color: "#123ABC" },
        );
        expect(renamed).toMatchObject({
          key: "missing_email",
          defaultName: "Sem e-mail",
          name: "Falta e-mail",
          color: "#123abc",
          customized: true,
        });

        // Só a cor: o nome continua o gravado.
        const recolored = await repository.updateAutomaticPatientTag(
          clinicId,
          adminId,
          "missing_email",
          { color: "#00ff00" },
        );
        expect(recolored).toMatchObject({
          name: "Falta e-mail",
          color: "#00ff00",
        });
        const listed = await repository.listAutomaticPatientTags(clinicId);
        expect(listed.find((tag) => tag.key === "missing_email")).toEqual(
          recolored,
        );
        expect(listed.filter((tag) => tag.key !== "missing_email")).toEqual(
          defaults.filter((tag) => tag.key !== "missing_email"),
        );

        const reset = await repository.resetAutomaticPatientTag(
          clinicId,
          adminId,
          "missing_email",
        );
        expect(reset).toEqual(
          defaults.find((tag) => tag.key === "missing_email"),
        );
        expect(await repository.listAutomaticPatientTags(clinicId)).toEqual(
          defaults,
        );
      });

      it("nome e cor iguais ao padrão voltam a acompanhar o padrão", async () => {
        const definition = automaticPatientTagDefinitions[0]!;
        await repository.updateAutomaticPatientTag(
          clinicId,
          adminId,
          definition.key,
          { name: "Em atraso" },
        );
        const back = await repository.updateAutomaticPatientTag(
          clinicId,
          adminId,
          definition.key,
          { name: definition.defaultName },
        );
        expect(back.customized).toBe(false);
        expect(back.name).toBe(definition.defaultName);
      });
    },
  );
}
