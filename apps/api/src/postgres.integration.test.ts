import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runMigrations, seedDemoData } from "./database.js";
import { PostgresClinicRepository } from "./postgres-repository.js";
import { DomainError } from "./repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const clinicId = "11111111-1111-4111-8111-111111111111";
const testCpf = "98765432100";
const appointmentMarker = "postgres-integration-test";

describe.skipIf(!databaseUrl)("PostgreSQL repository", () => {
  let pool: Pool;
  let repository: PostgresClinicRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    await runMigrations(pool);
    await seedDemoData(pool);
    repository = new PostgresClinicRepository(pool);
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM appointments WHERE notes = $1", [
      appointmentMarker,
    ]);
    await pool.query("DELETE FROM patients WHERE clinic_id = $1 AND cpf = $2", [
      clinicId,
      testCpf,
    ]);
    await pool.end();
  });

  it("persists a patient across repository instances", async () => {
    await pool.query("DELETE FROM patients WHERE clinic_id = $1 AND cpf = $2", [
      clinicId,
      testCpf,
    ]);
    const patient = await repository.createPatient(clinicId, {
      fullName: "Paciente de Integração",
      phone: "11999998888",
      cpf: testCpf,
      tags: ["Teste"],
    });

    const anotherInstance = new PostgresClinicRepository(pool);
    const persisted = await anotherInstance.listPatients(
      clinicId,
      patient.recordNumber,
    );
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.id).toBe(patient.id);
  });

  it("lets PostgreSQL reject concurrent schedule conflicts", async () => {
    await pool.query("DELETE FROM appointments WHERE notes = $1", [
      appointmentMarker,
    ]);
    const [patients, professionals, rooms, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const startsAt = new Date();
    startsAt.setUTCDate(startsAt.getUTCDate() + 30);
    startsAt.setUTCHours(15, 0, 0, 0);
    const input = {
      patientId: patients[0]!.id,
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      startsAt: startsAt.toISOString(),
      notes: appointmentMarker,
    };

    const results = await Promise.allSettled([
      repository.createAppointment(clinicId, input),
      repository.createAppointment(clinicId, input),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      reason: expect.objectContaining<Partial<DomainError>>({
        code: "APPOINTMENT_CONFLICT",
      }),
    });
  });
});
