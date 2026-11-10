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
const ownerId = "22222222-2222-4222-8222-222222222222";
const otherClinicId = "99999999-9999-4999-8999-999999999999";

for (const storage of ["memory", "mysql"] as const) {
  describe.skipIf(storage === "mysql" && !process.env.TEST_DATABASE_URL)(
    `${storage}: cópia cifrada da senha do usuário`,
    () => {
      let repository: ClinicRepository;
      let database: TestDatabase | undefined;
      let pool: Pool | undefined;

      beforeAll(async () => {
        if (storage === "memory") return;
        database = await createTestDatabase("pwcopy");
        pool = database.pool;
        repository = new MysqlClinicRepository(pool);
      }, 60_000);

      beforeEach(() => {
        if (storage === "memory") repository = new MemoryClinicRepository();
      });

      afterAll(async () => {
        await database?.drop();
      });

      const input = (email: string) => ({
        fullName: "Pessoa da equipe",
        email,
        role: "user" as const,
        password: "ignorada",
      });

      it("grava o par no cadastro e na troca, e nunca o devolve no usuário", async () => {
        const created = await repository.createAdminUser(
          clinicId,
          ownerId,
          input(`par.${storage}@teste.local`),
          { passwordHash: "hash-1", passwordEncrypted: "v1:a:b:c" },
        );
        expect(created).not.toHaveProperty("passwordEncrypted");
        expect(JSON.stringify(created)).not.toContain("v1:a:b:c");
        expect(
          await repository.findUserPasswordEncrypted(clinicId, created.id),
        ).toEqual({ found: true, encrypted: "v1:a:b:c" });

        const sessionBefore =
          (await repository.findUserById(clinicId, created.id))
            ?.sessionVersion ?? 0;
        expect(
          await repository.resetAdminUserPassword(
            clinicId,
            ownerId,
            created.id,
            {
              passwordHash: "hash-2",
              passwordEncrypted: "v1:d:e:f",
            },
          ),
        ).toBe(true);
        const after = await repository.findUserById(clinicId, created.id);
        expect(after?.passwordHash).toBe("hash-2");
        expect(after?.sessionVersion).toBe(sessionBefore + 1);
        expect(after).not.toHaveProperty("passwordEncrypted");
        expect(
          await repository.findUserPasswordEncrypted(clinicId, created.id),
        ).toEqual({ found: true, encrypted: "v1:d:e:f" });

        const listed = await repository.listAdminUsers(clinicId);
        expect(JSON.stringify(listed)).not.toContain("v1:d:e:f");

        // Só o hash (seeds/testes): a cópia antiga não vale mais e é apagada.
        await repository.resetAdminUserPassword(
          clinicId,
          ownerId,
          created.id,
          "hash-3",
        );
        expect(
          await repository.findUserPasswordEncrypted(clinicId, created.id),
        ).toEqual({ found: true, encrypted: null });
      });

      it("filtra pela clínica e audita a consulta sem nenhum valor de senha", async () => {
        const created = await repository.createAdminUser(
          clinicId,
          ownerId,
          input(`clinica.${storage}@teste.local`),
          { passwordHash: "hash", passwordEncrypted: "v1:x:y:z" },
        );
        expect(
          await repository.findUserPasswordEncrypted(otherClinicId, created.id),
        ).toEqual({ found: false, encrypted: null });
        expect(
          await repository.findUserPasswordEncrypted(
            clinicId,
            "00000000-0000-4000-8000-000000000000",
          ),
        ).toEqual({ found: false, encrypted: null });
        expect(
          await repository.resetAdminUserPassword(
            otherClinicId,
            ownerId,
            created.id,
            { passwordHash: "outro", passwordEncrypted: "v1:o:o:o" },
          ),
        ).toBe(false);
        expect(
          await repository.findUserPasswordEncrypted(clinicId, created.id),
        ).toEqual({ found: true, encrypted: "v1:x:y:z" });

        await repository.recordUserPasswordViewed(
          clinicId,
          ownerId,
          created.id,
        );
        const events = (await repository.listAdminAuditEvents(clinicId)).filter(
          (event) =>
            event.action === "user.password_viewed" &&
            event.entityId === created.id,
        );
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          actorUserId: ownerId,
          description: "Senha visualizada",
        });
        expect(JSON.stringify(events)).not.toContain("v1:x:y:z");
      });
    },
  );
}
