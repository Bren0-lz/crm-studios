import { appModuleSchema } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import {
  clinicId,
  databaseUrl,
  ownerId,
  permissionsUserEmail,
} from "../../../test-support/mysql-fixtures.js";
import "../../../test-support/mysql-setup.js";

describe.skipIf(!databaseUrl)("MySQL repository", () => {
  let database: TestDatabase | undefined;
  let pool: Pool;

  let repository: MysqlClinicRepository;

  it("paginates all audit events with timestamp ties and clinic-scoped cursors", async () => {
    const marker = `history-${randomUUID()}`;
    const ids = Array.from({ length: 235 }, () => randomUUID());
    const newerId = randomUUID();
    const futureId = randomUUID();
    try {
      // Todos com o mesmo instante (empate com microssegundos), mais recente que os eventos
      // do seed (que pode ter rodado há menos de 5 s num banco novo) e ainda no passado,
      // porque o histórico não lista datas futuras. O instante vem do relógio do banco.
      await pool.query(
        `INSERT INTO audit_events (id, clinic_id, actor_user_id, ip_address, action, entity_type, created_at)
         SELECT j.id, $1, $4, '192.0.2.1', $2, 'clinic',
                CAST(NOW(6) - INTERVAL 2000 MICROSECOND AS DATETIME(3)) + INTERVAL 456 MICROSECOND
         FROM JSON_TABLE($3, '$[*]' COLUMNS(id VARCHAR(36) PATH '$')) AS j`,
        [clinicId, marker, ids, ownerId],
      );
      const first = await repository.listAdminAuditPage(clinicId);
      expect(first.items).toHaveLength(50);
      expect(first.items[0]).toMatchObject({
        clinicId,
        actorUserId: ownerId,
        ipAddress: "192.0.2.1",
      });
      await pool.query(
        "INSERT INTO audit_events (id, clinic_id, action, entity_type, created_at) VALUES ($1, $2, $3, 'clinic', NOW(6)), ($4, $2, $3, 'clinic', '2100-01-01')",
        [newerId, clinicId, marker, futureId],
      );
      const found = first.items
        .filter((event) => event.action === marker)
        .map((event) => event.id);
      let page = first;
      while (page.nextCursor) {
        page = await repository.listAdminAuditPage(clinicId, page.nextCursor);
        found.push(
          ...page.items
            .filter((event) => event.action === marker)
            .map((event) => event.id),
        );
      }
      expect(found).toEqual([...ids].sort().reverse());
      expect(new Set(found).size).toBe(235);
      const latest = await repository.listAdminAuditPage(clinicId);
      expect(latest.items[0]!.id).toBe(newerId);
      expect(latest.items.some((event) => event.id === futureId)).toBe(false);
      const otherClinic = randomUUID();
      expect(await repository.listAdminAuditPage(otherClinic)).toEqual({
        items: [],
        nextCursor: null,
      });
      await expect(
        repository.listAdminAuditPage(otherClinic, first.nextCursor!),
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        repository.listAdminAuditPage(clinicId, randomUUID()),
      ).rejects.toMatchObject({ statusCode: 400 });
    } finally {
      await pool.query(
        "DELETE FROM audit_events WHERE clinic_id = $1 AND action = $2",
        [clinicId, marker],
      );
    }
  });

  it("persists granular permissions, audits before/after and isolates clinics", async () => {
    const email = `operation-${randomUUID()}@test.local`;
    const user = await repository.createAdminUser(
      clinicId,
      "22222222-2222-4222-8222-222222222222",
      {
        fullName: "Operation User",
        email,
        role: "user",
        password: "Password123",
        permissions: ["finance.view", "finance.receive"],
      },
      "unused-hash",
    );
    try {
      expect(
        (await repository.findUserById(clinicId, user.id))?.permissions,
      ).toEqual(["finance.view", "finance.receive"]);
      expect(await repository.findUserById(randomUUID(), user.id)).toBeNull();
      expect(
        await repository.updateAdminUser(
          randomUUID(),
          "22222222-2222-4222-8222-222222222222",
          user.id,
          {
            fullName: user.fullName,
            role: "user",
            active: true,
            permissions: [],
          },
        ),
      ).toBeNull();
      await repository.updateAdminUser(
        clinicId,
        "22222222-2222-4222-8222-222222222222",
        user.id,
        { fullName: user.fullName, role: "user", active: true },
      );
      expect(
        (await repository.findUserById(clinicId, user.id))?.permissions,
      ).toEqual(["finance.view", "finance.receive"]);
      await repository.updateAdminUser(
        clinicId,
        "22222222-2222-4222-8222-222222222222",
        user.id,
        {
          fullName: user.fullName,
          role: "user",
          active: true,
          permissions: [],
        },
      );
      expect(
        (
          await pool.query("SELECT permissions FROM users WHERE id=$1", [
            user.id,
          ])
        ).rows[0]!.permissions,
      ).toEqual([]);
      expect(
        (await repository.listAdminAuditEvents(clinicId)).find(
          (event) =>
            event.entityId === user.id &&
            event.action === "users.permissions_updated" &&
            (event.metadata.permissions as string[]).length === 0,
        )?.metadata,
      ).toMatchObject({
        previousPermissions: ["finance.view", "finance.receive"],
        permissions: [],
      });
    } finally {
      await pool.query("DELETE FROM audit_events WHERE entity_id=$1", [
        user.id,
      ]);
      await pool.query("DELETE FROM users WHERE id=$1", [user.id]);
    }
  });

  beforeAll(async () => {
    database = await createTestDatabase("history");
    pool = database.pool;
    repository = new MysqlClinicRepository(pool);
  }, 60_000);

  async function cleanupPermissionsUser() {
    const ids = `SELECT id FROM users WHERE clinic_id = $1 AND email = $2`;
    await pool.query(
      `DELETE FROM audit_events WHERE clinic_id = $1 AND entity_type = 'user' AND entity_id IN (${ids})`,
      [clinicId, permissionsUserEmail],
    );
    await pool.query(
      `DELETE FROM commission_entries WHERE clinic_id = $1 AND rule_id IN
         (SELECT id FROM commission_rules WHERE clinic_id = $1 AND user_id IN (${ids}))`,
      [clinicId, permissionsUserEmail],
    );
    await pool.query(
      `DELETE FROM commission_rules WHERE clinic_id = $1 AND user_id IN (${ids})`,
      [clinicId, permissionsUserEmail],
    );
    await pool.query(
      `UPDATE professionals SET user_id = NULL WHERE clinic_id = $1 AND user_id IN (${ids})`,
      [clinicId, permissionsUserEmail],
    );
    await pool.query("DELETE FROM users WHERE clinic_id = $1 AND email = $2", [
      clinicId,
      permissionsUserEmail,
    ]);
  }

  afterAll(async () => {
    await database?.drop();
  });

  it("persists job title and per-user modules and audits permission changes", async () => {
    await cleanupPermissionsUser();
    try {
      const created = await repository.createAdminUser(
        clinicId,
        ownerId,
        {
          fullName: "Teste Permissões",
          email: permissionsUserEmail,
          role: "user",
          password: "Segura@1234",
          jobTitle: "Instrutora de Pilates",
        },
        "hash-de-teste",
      );
      // Usuário comum novo começa sem nenhum módulo.
      expect(created).toMatchObject({
        jobTitle: "Instrutora de Pilates",
        customModules: false,
        modules: [],
        editModules: [],
      });
      const base = {
        fullName: "Teste Permissões",
        role: "user" as const,
        active: true,
      };
      const custom = await repository.updateAdminUser(
        clinicId,
        ownerId,
        created.id,
        {
          ...base,
          modules: ["finance", "agenda", "finance"],
        },
      );
      expect(custom).toMatchObject({
        customModules: true,
        modules: ["agenda", "finance"],
      });
      const kept = await repository.updateAdminUser(
        clinicId,
        ownerId,
        created.id,
        {
          ...base,
          jobTitle: "",
        },
      );
      expect(kept).toMatchObject({ modules: ["agenda", "finance"] });
      expect(kept?.jobTitle).toBeUndefined();
      const stored = await pool.query<{
        modules: string[] | null;
        job_title: string | null;
      }>("SELECT modules, job_title FROM users WHERE id = $1", [created.id]);
      expect(stored.rows[0]).toEqual({
        modules: ["agenda", "finance"],
        job_title: null,
      });
      const reset = await repository.updateAdminUser(
        clinicId,
        ownerId,
        created.id,
        {
          ...base,
          modules: null,
        },
      );
      expect(reset).toMatchObject({ customModules: false, modules: [] });
      expect(
        (await repository.findUserById(clinicId, created.id))?.modules,
      ).toEqual([]);
      const promoted = await repository.updateAdminUser(
        clinicId,
        ownerId,
        created.id,
        {
          ...base,
          role: "admin",
          modules: ["agenda"],
        },
      );
      expect(promoted).toMatchObject({ role: "admin", customModules: false });
      expect(promoted?.modules).toEqual(appModuleSchema.options);
      const promotedRow = await pool.query<{
        role: string;
        modules: string[] | null;
      }>("SELECT role, modules FROM users WHERE id = $1", [created.id]);
      expect(promotedRow.rows[0]).toEqual({ role: "admin", modules: null });
      const events = (await repository.listAdminAuditEvents(clinicId)).filter(
        (item) =>
          item.action === "users.permissions_updated" &&
          item.entityId === created.id,
      );
      expect(events).toHaveLength(3);
    } finally {
      await cleanupPermissionsUser();
    }
  });
});
