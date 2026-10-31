import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MemoryClinicRepository } from "../../../memory-repository.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import type { ClinicRepository } from "../../../repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  ownerId = "22222222-2222-4222-8222-222222222222";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: acesso ao painel de vendas`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("dashaccess");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      it("starts denied even for admin, then saves, keeps and removes the access", async () => {
        const owner = await repository.findUserById(clinicId, ownerId);
        expect(owner?.role).toBe("admin");
        expect(owner?.dashboardAccess).toBe(false);

        const created = await repository.createAdminUser(
          clinicId,
          ownerId,
          {
            fullName: "Vendedora do Painel",
            email: `painel-${storage}@example.com`,
            password: "Password123",
            role: "user",
            permissions: ["crm.view"],
            dashboardAccess: true,
          },
          "hash-de-teste",
        );
        expect(created.dashboardAccess).toBe(true);
        expect(
          (await repository.findUserById(clinicId, created.id))?.dashboardAccess,
        ).toBe(true);

        // Sem o campo, a edição mantém o acesso gravado.
        const kept = await repository.updateAdminUser(
          clinicId,
          ownerId,
          created.id,
          { fullName: "Vendedora", role: "user", active: true },
        );
        expect(kept?.dashboardAccess).toBe(true);

        const removed = await repository.updateAdminUser(
          clinicId,
          ownerId,
          created.id,
          {
            fullName: "Vendedora",
            role: "user",
            active: true,
            dashboardAccess: false,
          },
        );
        expect(removed?.dashboardAccess).toBe(false);
        const listed = (await repository.listAdminUsers(clinicId)).find(
          (user) => user.id === created.id,
        );
        expect(listed?.dashboardAccess).toBe(false);
      });
    },
  );
}
