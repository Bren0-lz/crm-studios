import { appModuleSchema, permissionKeys } from "@crm/contracts";
import { randomUUID } from "node:crypto";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { legacyRoleDefaultModules } from "../../../modules/administration/legacy-roles.js";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { createDefaultBranch } from "../branches.js";
import {
  clinicId,
  databaseUrl,
  ownerId,
  permissionsUserEmail,
} from "../../../test-support/mysql-fixtures.js";
import { atInstant } from "../../../test-support/clock.js";
import "../../../test-support/mysql-setup.js";

describe.skipIf(!databaseUrl)("MySQL repository", () => {
  let database: TestDatabase | undefined;
  let pool: Pool;

  let repository: MysqlClinicRepository;

  it("serializes draft creation and checks update permission before overwriting", async () => {
    const user = await repository.createAdminUser(
      clinicId,
      ownerId,
      {
        fullName: "Clinical Permission Test",
        email: `${randomUUID()}@test.local`,
        role: "user",
        password: "Password123",
        permissions: ["clinical.view", "clinical.records_create"],
      },
      "unused-hash",
    );
    const [patients, professionals, rooms, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patients[0]!.id,
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      startsAt: "2039-02-10T12:00:00.000Z",
      visitType: "regular",
      notes: "permission-concurrency",
    });
    const input = {
      appointmentId: appointment.id,
      subjective: "Original",
      objective: "",
      assessment: "",
      plan: "",
    };
    const cleanupFixture = async () => {
      const cleanup = await pool.connect();
      try {
        // Remove the fixture in the disposable test database, ignoring foreign keys
        // only on this connection (restored before it returns to the pool).
        await cleanup.query("SET FOREIGN_KEY_CHECKS = 0");
        await cleanup.query("START TRANSACTION");
        await cleanup.query(
          "DELETE FROM clinical_record_revisions WHERE clinical_record_id IN (SELECT id FROM clinical_records WHERE appointment_id=$1)",
          [appointment.id],
        );
        await cleanup.query(
          "DELETE FROM clinical_records WHERE appointment_id=$1",
          [appointment.id],
        );
        await cleanup.query("DELETE FROM appointments WHERE id=$1", [
          appointment.id,
        ]);
        await cleanup.query("DELETE FROM audit_events WHERE entity_id=$1", [
          user.id,
        ]);
        await cleanup.query("DELETE FROM users WHERE id=$1", [user.id]);
        await cleanup.query("COMMIT");
      } catch (error) {
        await cleanup.query("ROLLBACK");
        throw error;
      } finally {
        await cleanup.query("SET FOREIGN_KEY_CHECKS = 1");
        cleanup.release();
      }
    };
    try {
      // Evolução só vale a partir de 15 min antes do início (QC3).
      const results = await atInstant(appointment.startsAt, () =>
        Promise.allSettled(
          [1, 2].map(() =>
            repository.saveClinicalRecord(clinicId, user.id, input),
          ),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected"),
      ).toMatchObject({
        reason: {
          statusCode: 403,
          details: { permission: "clinical.records_update" },
        },
      });
      expect(
        (
          await pool.query(
            "SELECT version,subjective FROM clinical_records WHERE appointment_id=$1",
            [appointment.id],
          )
        ).rows[0],
      ).toMatchObject({ version: 1, subjective: "Original" });
      await repository.updateAdminUser(clinicId, ownerId, user.id, {
        fullName: user.fullName,
        role: "user",
        active: true,
        permissions: ["clinical.view", "clinical.records_update"],
      });
      await atInstant(appointment.startsAt, () =>
        repository.saveClinicalRecord(clinicId, user.id, {
          ...input,
          subjective: "Changed",
        }),
      );
      expect(
        (
          await pool.query(
            "SELECT version,subjective FROM clinical_records WHERE appointment_id=$1",
            [appointment.id],
          )
        ).rows[0],
      ).toMatchObject({ version: 2, subjective: "Changed" });
    } finally {
      await cleanupFixture();
    }
  });

  it("serializes simultaneous demotions and retains one active administrator", async () => {
    const clinic = randomUUID();
    const first = randomUUID();
    const second = randomUUID();
    await pool.query(
      "INSERT INTO clinics(id,name,timezone) VALUES ($1,'Concurrent Permissions','America/Sao_Paulo')",
      [clinic],
    );
    await createDefaultBranch(pool, clinic);
    try {
      for (const id of [first, second])
        await pool.query(
          "INSERT INTO users(id,clinic_id,full_name,email,role,password_hash) VALUES ($1,$2,'Admin Test',$3,'admin','unused')",
          [id, clinic, `${id}@test.local`],
        );
      expect(
        (await repository.findUserById(clinic, first))?.permissions,
      ).toEqual(permissionKeys);
      const results = await Promise.allSettled(
        [first, second].map((id) =>
          repository.updateAdminUser(clinic, id, id, {
            fullName: "Former Admin",
            role: "user",
            active: true,
            permissions: [],
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { code: "LAST_ADMIN" } });
      expect(
        (
          await pool.query(
            "SELECT COUNT(*) AS count FROM users WHERE clinic_id=$1 AND active AND role='admin'",
            [clinic],
          )
        ).rows[0]!.count,
      ).toBe(1);
    } finally {
      await pool.query("DELETE FROM audit_events WHERE clinic_id=$1", [clinic]);
      await pool.query("DELETE FROM users WHERE clinic_id=$1", [clinic]);
      await pool.query("DELETE FROM clinics WHERE id=$1", [clinic]);
    }
  });

  beforeAll(async () => {
    database = await createTestDatabase("administrati");
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

  it("persists per-user edit levels inside the visible modules", async () => {
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
          modules: [...legacyRoleDefaultModules.physiotherapist],
        },
        "hash-de-teste",
      );
      expect(created).toMatchObject({ customModules: true, editModules: [] });
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
          editModules: ["patients", "finance", "clinical", "patients"],
        },
      );
      expect(custom).toMatchObject({
        customModules: true,
        editModules: ["patients", "clinical"],
      });
      const stored = await pool.query<{
        modules: string[] | null;
        edit_modules: string[] | null;
      }>("SELECT modules, edit_modules FROM users WHERE id = $1", [created.id]);
      expect(stored.rows[0]).toEqual({
        modules: ["agenda", "groups", "patients", "plans", "clinical"],
        edit_modules: ["patients", "clinical"],
      });
      const narrowed = await repository.updateAdminUser(
        clinicId,
        ownerId,
        created.id,
        {
          ...base,
          modules: ["agenda", "clinical"],
        },
      );
      expect(narrowed).toMatchObject({
        modules: ["agenda", "clinical"],
        editModules: ["clinical"],
      });
      expect(
        (await repository.findUserById(clinicId, created.id))?.editModules,
      ).toEqual(["clinical"]);
      const reset = await repository.updateAdminUser(
        clinicId,
        ownerId,
        created.id,
        {
          ...base,
          modules: null,
          editModules: null,
        },
      );
      expect(reset).toMatchObject({
        customModules: false,
        modules: [],
        editModules: [],
      });
      const events = (await repository.listAdminAuditEvents(clinicId)).filter(
        (item) =>
          item.action === "users.permissions_updated" &&
          item.entityId === created.id,
      );
      expect(events).toHaveLength(4);
    } finally {
      await cleanupPermissionsUser();
    }
  });

  it("stores and clears the payment receipt message template", async () => {
    const before = (await repository.getClinicSettings(clinicId))!;
    try {
      const saved = await repository.updateClinicSettings(clinicId, ownerId, {
        name: before.name,
        timezone: before.timezone,
        paymentReceiptMessageTemplate: "Oi {{nome}}! Recibo: {{link_recibo}}",
      });
      expect(saved.paymentReceiptMessageTemplate).toBe(
        "Oi {{nome}}! Recibo: {{link_recibo}}",
      );
      expect(saved.pixMessageTemplate).toBe(before.pixMessageTemplate);
      const untouched = await repository.updateClinicSettings(
        clinicId,
        ownerId,
        { name: before.name, timezone: before.timezone },
      );
      expect(untouched.paymentReceiptMessageTemplate).toBe(
        "Oi {{nome}}! Recibo: {{link_recibo}}",
      );
      const cleared = await repository.updateClinicSettings(clinicId, ownerId, {
        name: before.name,
        timezone: before.timezone,
        paymentReceiptMessageTemplate: "",
      });
      expect(cleared.paymentReceiptMessageTemplate).toBe("");
    } finally {
      await repository.updateClinicSettings(clinicId, ownerId, {
        name: before.name,
        timezone: before.timezone,
        legalName: before.legalName ?? "",
        taxId: before.taxId ?? "",
        phone: before.phone ?? "",
        email: before.email ?? "",
        address: before.address ?? "",
        pixKey: before.pixKey ?? "",
        pixMessageTemplate: before.pixMessageTemplate ?? "",
        paymentReceiptMessageTemplate:
          before.paymentReceiptMessageTemplate ?? "",
      });
    }
  });

  it("stores and clears the clinic Pix key and message without touching the other settings", async () => {
    const before = (await repository.getClinicSettings(clinicId))!;
    try {
      const saved = await repository.updateClinicSettings(clinicId, ownerId, {
        name: before.name,
        timezone: before.timezone,
        pixKey: "financeiro@aryana.com.br",
        pixMessageTemplate: "Olá, {{nome}}! Chave: {{chave_pix}}",
      });
      expect(saved.pixKey).toBe("financeiro@aryana.com.br");
      expect(saved.pixMessageTemplate).toBe(
        "Olá, {{nome}}! Chave: {{chave_pix}}",
      );
      expect((await repository.getClinicSettings(clinicId))?.pixKey).toBe(
        "financeiro@aryana.com.br",
      );
      const cleared = await repository.updateClinicSettings(clinicId, ownerId, {
        name: before.name,
        timezone: before.timezone,
        pixKey: "",
        pixMessageTemplate: "",
      });
      expect(cleared.pixKey).toBe("");
      expect(cleared.pixMessageTemplate).toBe("");
    } finally {
      await repository.updateClinicSettings(clinicId, ownerId, {
        name: before.name,
        timezone: before.timezone,
        legalName: before.legalName ?? "",
        taxId: before.taxId ?? "",
        phone: before.phone ?? "",
        email: before.email ?? "",
        address: before.address ?? "",
        pixKey: before.pixKey ?? "",
        pixMessageTemplate: before.pixMessageTemplate ?? "",
      });
    }
  });

  it("updates the own profile, photo and linked professional in one transaction", async () => {
    const crefito = `PERFIL-${randomUUID().slice(0, 8)}`;
    const cleanup = async () => {
      await cleanupPermissionsUser();
      await pool.query(
        "DELETE FROM professionals WHERE clinic_id = $1 AND crefito = $2",
        [clinicId, crefito],
      );
    };
    await cleanup();
    try {
      const user = await repository.createAdminUser(
        clinicId,
        ownerId,
        {
          fullName: "Teste Perfil",
          email: permissionsUserEmail,
          role: "user",
          password: "Segura@1234",
        },
        "hash-de-teste",
      );
      expect(await repository.getOwnProfile(clinicId, user.id)).toMatchObject({
        fullName: "Teste Perfil",
        avatarDataUrl: "",
        professional: null,
      });
      const inserted = { rows: [{ id: randomUUID() }] };
      await pool.query(
        `INSERT INTO professionals (id, clinic_id, user_id, full_name, crefito, specialty, color, branch_id)
         VALUES ($4, $1, $2, 'Perfil Agenda', $3, 'Pilates', '#5c6f68', (SELECT b.id FROM branches b WHERE b.clinic_id = $1 AND b.is_default = 1))`,
        [clinicId, user.id, crefito, inserted.rows[0]!.id],
      );
      const photo = "data:image/png;base64,iVBORw0KGgo=";
      const updated = await repository.updateOwnProfile(clinicId, user.id, {
        fullName: "Teste Perfil Novo",
        avatarDataUrl: photo,
        agendaName: "Perfil na Agenda",
        agendaColor: "#123456",
      });
      expect(updated).toMatchObject({
        fullName: "Teste Perfil Novo",
        avatarDataUrl: photo,
        professional: {
          id: inserted.rows[0]!.id,
          fullName: "Perfil na Agenda",
          color: "#123456",
        },
      });
      const kept = await repository.updateOwnProfile(clinicId, user.id, {
        fullName: "Teste Perfil Novo",
      });
      expect(kept).toMatchObject({
        avatarDataUrl: photo,
        professional: { fullName: "Perfil na Agenda" },
      });
      const removed = await repository.updateOwnProfile(clinicId, user.id, {
        fullName: "Teste Perfil Novo",
        avatarDataUrl: "",
      });
      expect(removed?.avatarDataUrl).toBe("");
      expect(
        await repository.updateOwnProfile(clinicId, randomUUID(), {
          fullName: "Ninguém",
        }),
      ).toBeNull();
    } finally {
      await cleanup();
    }
  });

  it("refuses to demote or deactivate the last active admin of a clinic", async () => {
    const lonelyClinic = "0f550000-0000-4000-8000-000000000055";
    const cleanup = async () => {
      await pool.query("DELETE FROM audit_events WHERE clinic_id = $1", [
        lonelyClinic,
      ]);
      await pool.query("DELETE FROM users WHERE clinic_id = $1", [
        lonelyClinic,
      ]);
      await pool.query("DELETE FROM clinics WHERE id = $1", [lonelyClinic]);
    };
    await cleanup();
    try {
      await pool.query("INSERT INTO clinics (id, name) VALUES ($1, $2)", [
        lonelyClinic,
        "Clínica T055",
      ]);
      await createDefaultBranch(pool, lonelyClinic);
      const admin = await repository.createAdminUser(
        lonelyClinic,
        ownerId,
        {
          fullName: "Única Admin",
          email: "t055-admin@movimenta.local",
          role: "admin",
          password: "Segura@1234",
        },
        "hash-de-teste",
      );
      const other = await repository.createAdminUser(
        lonelyClinic,
        ownerId,
        {
          fullName: "Outra Pessoa",
          email: "t055-user@movimenta.local",
          role: "user",
          password: "Segura@1234",
        },
        "hash-de-teste",
      );
      const base = {
        fullName: "Única Admin",
        role: "admin" as const,
        active: true,
      };
      await expect(
        repository.updateAdminUser(lonelyClinic, other.id, admin.id, {
          ...base,
          role: "user",
        }),
      ).rejects.toMatchObject({ code: "LAST_ADMIN", statusCode: 409 });
      await expect(
        repository.updateAdminUser(lonelyClinic, other.id, admin.id, {
          ...base,
          active: false,
        }),
      ).rejects.toMatchObject({ code: "LAST_ADMIN", statusCode: 409 });
      expect(
        await repository.findUserById(lonelyClinic, admin.id),
      ).toMatchObject({
        role: "admin",
        active: true,
      });
      await repository.updateAdminUser(lonelyClinic, admin.id, other.id, {
        fullName: "Outra Pessoa",
        role: "admin",
        active: true,
      });
      expect(
        await repository.updateAdminUser(lonelyClinic, other.id, admin.id, {
          ...base,
          role: "user",
        }),
      ).toMatchObject({ role: "user", modules: [] });
    } finally {
      await cleanup();
    }
  });

  it("stores the demo admin as admin after the migrations", async () => {
    const owner = await pool.query<{ role: string }>(
      "SELECT role FROM users WHERE id = $1",
      [ownerId],
    );
    expect(owner.rows[0]?.role).toBe("admin");
    expect(await repository.findUserById(clinicId, ownerId)).toMatchObject({
      role: "admin",
      modules: appModuleSchema.options,
    });
  });
});
