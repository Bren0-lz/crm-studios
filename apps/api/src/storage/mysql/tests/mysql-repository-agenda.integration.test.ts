import { nextTestCpf } from "../../../test-support/cpf.js";
import { appointmentStatusSchema, saoPauloToday } from "@crm/contracts";
import type { Database as Pool } from "../../../infrastructure/mysql-client.js";
import {
  createTestDatabase,
  type TestDatabase,
} from "../../../test-support/mysql-database.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MysqlClinicRepository } from "../../../mysql-repository.js";
import { DomainError } from "../../../repository.js";
import {
  appointmentMarker,
  clinicId,
  databaseUrl,
  ownerId,
  satisfactionCpf,
  satisfactionMarker,
} from "../../../test-support/mysql-fixtures.js";
import { atInstant } from "../../../test-support/clock.js";
import "../../../test-support/mysql-setup.js";

describe.skipIf(!databaseUrl)("MySQL repository", () => {
  let database: TestDatabase | undefined;
  let pool: Pool;

  let repository: MysqlClinicRepository;

  beforeAll(async () => {
    database = await createTestDatabase("agenda");
    pool = database.pool;
    repository = new MysqlClinicRepository(pool);
  }, 60_000);

  it("stores the professionals and rooms of a service", async () => {
    const [professional] = await repository.listProfessionals(clinicId);
    const [room] = await repository.listRooms(clinicId);
    const name = `PG serviço vinculado ${Date.now()}`;
    try {
      const created = await repository.createService(clinicId, {
        name,
        durationMinutes: 50,
        professionalIds: [professional!.id],
        roomIds: [room!.id],
      });
      expect(created).toMatchObject({
        professionalIds: [professional!.id],
        roomIds: [room!.id],
      });
      const listed = (await repository.listServices(clinicId)).find(
        (item) => item.id === created.id,
      );
      expect(listed?.professionalIds).toEqual([professional!.id]);
    } finally {
      await pool.query(
        "DELETE FROM services WHERE clinic_id = $1 AND name = $2",
        [clinicId, name],
      );
    }
  });

  it("finds the service of an appointment, null when missing (QM3)", async () => {
    const [appointment] = await repository.listAppointments(
      clinicId,
      "2000-01-01T00:00:00.000Z",
      "2100-01-01T00:00:00.000Z",
    );
    expect(
      await repository.findAppointmentServiceId(clinicId, appointment!.id),
    ).toBe(appointment!.serviceId);
    expect(
      await repository.findAppointmentServiceId(
        clinicId,
        "00000000-0000-4000-8000-000000000000",
      ),
    ).toBeNull();
  });

  it("edits service, room and note of a scheduled appointment with audit (QM6)", async () => {
    const [patients, professionals, rooms, services] = await Promise.all([
      repository.listPatients(clinicId),
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const marker = `PG edição QM6 ${Date.now()}`;
    const [first, second] = services.filter(
      (item) => !item.professionalIds?.length && !item.roomIds?.length,
    );
    const free = rooms.find((item) => item.id !== rooms[0]!.id)!;
    const created: string[] = [];
    try {
      const appointment = await repository.createAppointment(clinicId, {
        patientId: patients[0]!.id,
        professionalId: professionals[0]!.id,
        roomId: rooms[0]!.id,
        serviceId: first!.id,
        startsAt: "2097-03-04T13:07:00.000Z",
        notes: marker,
        visitType: "regular",
      });
      created.push(appointment.id);
      const updated = await repository.updateAppointment(
        clinicId,
        ownerId,
        appointment.id,
        { serviceId: second!.id, roomId: free.id, notes: "" },
      );
      expect(updated).toMatchObject({
        serviceId: second!.id,
        roomId: free.id,
        professionalId: professionals[0]!.id,
        startsAt: appointment.startsAt,
        endsAt: new Date(
          Date.parse(appointment.startsAt) + second!.durationMinutes * 60_000,
        ).toISOString(),
      });
      expect(updated?.notes).toBeUndefined();
      const audit = await pool.query(
        "SELECT module FROM audit_events WHERE clinic_id = $1 AND action = 'appointment.updated' AND entity_id = $2",
        [clinicId, appointment.id],
      );
      expect(audit.rows).toEqual([{ module: "agenda" }]);
      expect(
        await repository.updateAppointment(
          clinicId,
          ownerId,
          "00000000-0000-4000-8000-000000000000",
          { serviceId: second!.id, roomId: free.id },
        ),
      ).toBeNull();
      await repository.updateAppointmentStatus(
        clinicId,
        appointment.id,
        "cancelled",
        "Cliente desmarcou",
      );
      await expect(
        repository.updateAppointment(clinicId, ownerId, appointment.id, {
          serviceId: first!.id,
          roomId: free.id,
        }),
      ).rejects.toMatchObject({ code: "APPOINTMENT_UPDATE_FORBIDDEN" });
    } finally {
      await pool.query(
        "DELETE FROM audit_events WHERE clinic_id = $1 AND JSON_CONTAINS($2, JSON_QUOTE(entity_id))",
        [clinicId, created],
      );
      await pool.query(
        "DELETE FROM appointments WHERE clinic_id = $1 AND JSON_CONTAINS($2, JSON_QUOTE(id))",
        [clinicId, created],
      );
    }
  });

  it("loads the group workspace with each class's professional", async () => {
    const workspace = await repository.getGroupWorkspace(
      clinicId,
      "2026-01-01T00:00:00.000Z",
      "2026-12-31T23:59:59.000Z",
    );
    expect(Array.isArray(workspace.groups)).toBe(true);
    expect(Array.isArray(workspace.sessions)).toBe(true);
    for (const group of workspace.groups)
      expect(typeof group.professionalName).toBe("string");
  });

  it("limits group session participants to the enrollment period", async () => {
    const phone = "11977770481";
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 60 * 86_400_000).toISOString();
    const clinicDate = (value: string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value));
    const cleanup = async () => {
      const patients =
        "SELECT id FROM patients WHERE clinic_id=$1 AND phone=$2";
      for (const table of [
        "group_attendance",
        "replacement_credits",
        "group_enrollments",
      ])
        await pool.query(
          `DELETE FROM ${table} WHERE clinic_id=$1 AND patient_id IN (${patients})`,
          [clinicId, phone],
        );
      await pool.query("DELETE FROM patients WHERE clinic_id=$1 AND phone=$2", [
        clinicId,
        phone,
      ]);
    };
    await cleanup();
    try {
      const workspace = await repository.getGroupWorkspace(clinicId, from, to);
      const group = workspace.groups.find((item) => item.active)!;
      const [first, second] = workspace.sessions.filter(
        (item) =>
          item.groupId === group.id &&
          item.status === "scheduled" &&
          clinicDate(item.startsAt) > saoPauloToday(),
      );
      expect(second).toBeDefined();
      if (clinicDate(first!.startsAt) === clinicDate(second!.startsAt)) return;
      if (group.activeEnrollments >= group.capacity) return;
      const patient = await repository.createPatient(clinicId, {
        cpf: nextTestCpf(),
        fullName: "PG período da matrícula",
        phone,
        tags: [],
      });
      const enrollment = await repository.createGroupEnrollment(clinicId, {
        groupId: group.id,
        patientId: patient.id,
        startsOn: clinicDate(second!.startsAt),
      });
      expect(enrollment).toMatchObject({
        status: "active",
        startsOn: clinicDate(second!.startsAt),
      });
      expect(enrollment.endedOn).toBeUndefined();
      await expect(
        repository.recordGroupAttendance(
          clinicId,
          ownerId,
          first!.id,
          patient.id,
          { status: "absent" },
        ),
      ).rejects.toMatchObject({ code: "GROUP_ATTENDANCE_NOT_ALLOWED" });
      await expect(
        repository.recordGroupAttendance(
          clinicId,
          ownerId,
          second!.id,
          patient.id,
          { status: "absent" },
        ),
      ).resolves.toMatchObject({ status: "absent" });
      const cancelled = await repository.cancelGroupEnrollment(
        clinicId,
        enrollment.id,
      );
      expect(cancelled).toMatchObject({
        status: "cancelled",
        startsOn: clinicDate(second!.startsAt),
        endedOn: saoPauloToday(),
      });
      // Cancelada hoje: o encontro futuro deixa de aceitar presença.
      await expect(
        repository.recordGroupAttendance(
          clinicId,
          ownerId,
          second!.id,
          patient.id,
          { status: "present" },
        ),
      ).rejects.toMatchObject({ code: "GROUP_ATTENDANCE_NOT_ALLOWED" });
      const listed = (
        await repository.getGroupWorkspace(clinicId, from, to)
      ).enrollments.find((item) => item.id === enrollment.id);
      expect(listed).toMatchObject({
        startsOn: clinicDate(second!.startsAt),
        endedOn: saoPauloToday(),
      });
    } finally {
      await cleanup();
    }
  });

  it("books a replacement only in a future session other than the source", async () => {
    const phone = "11977770582";
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = new Date(Date.now() + 60 * 86_400_000).toISOString();
    const cleanup = async () => {
      const patients =
        "SELECT id FROM patients WHERE clinic_id=$1 AND phone=$2";
      for (const table of [
        "group_attendance",
        "replacement_credits",
        "group_enrollments",
      ])
        await pool.query(
          `DELETE FROM ${table} WHERE clinic_id=$1 AND patient_id IN (${patients})`,
          [clinicId, phone],
        );
      await pool.query("DELETE FROM patients WHERE clinic_id=$1 AND phone=$2", [
        clinicId,
        phone,
      ]);
    };
    await cleanup();
    try {
      const workspace = await repository.getGroupWorkspace(clinicId, from, to);
      const group = workspace.groups.find(
        (item) => item.active && item.activeEnrollments < item.capacity,
      );
      if (!group) return;
      const sessions = workspace.sessions.filter(
        (item) => item.groupId === group.id && item.status === "scheduled",
      );
      const future = sessions.filter(
        (item) => new Date(item.startsAt).getTime() > Date.now(),
      );
      if (future.length < 2) return;
      const patient = await repository.createPatient(clinicId, {
        cpf: nextTestCpf(),
        fullName: "PG reposição futura",
        phone,
        tags: [],
      });
      await repository.createGroupEnrollment(clinicId, {
        groupId: group.id,
        patientId: patient.id,
      });
      await repository.recordGroupAttendance(
        clinicId,
        ownerId,
        future[0]!.id,
        patient.id,
        { status: "excused_absence" },
      );
      const credit = (
        await repository.getGroupWorkspace(clinicId, from, to)
      ).replacementCredits.find(
        (item) =>
          item.patientId === patient.id &&
          item.sourceSessionId === future[0]!.id,
      )!;
      await expect(
        repository.bookReplacement(clinicId, ownerId, {
          creditId: credit.id,
          sessionId: future[0]!.id,
        }),
      ).rejects.toThrow(
        "A reposição precisa ser em outro encontro, não no da falta.",
      );
      const past = workspace.sessions.find(
        (item) =>
          item.status === "scheduled" &&
          new Date(item.startsAt).getTime() <= Date.now() &&
          workspace.groups.find((entry) => entry.id === item.groupId)
            ?.serviceId === group.serviceId,
      );
      if (past)
        await expect(
          repository.bookReplacement(clinicId, ownerId, {
            creditId: credit.id,
            sessionId: past.id,
          }),
        ).rejects.toThrow("Escolha um encontro futuro.");
      await expect(
        repository.bookReplacement(clinicId, ownerId, {
          creditId: credit.id,
          sessionId: future[1]!.id,
        }),
      ).resolves.toMatchObject({ credit: { status: "used" } });
    } finally {
      await cleanup();
    }
  });

  it("lists only pending dashboard appointments even after their scheduled time", async () => {
    const ids: string[] = [];
    try {
      for (const date of ["2000-10-12", "2099-10-12"]) {
        const dayIds: string[] = [];
        for (const [
          index,
          status,
        ] of appointmentStatusSchema.options.entries()) {
          const created = await repository.createAppointment(clinicId, {
            patientId: "99999999-9999-4999-8999-999999999999",
            professionalId: "33333333-3333-4333-8333-333333333333",
            roomId: "55555555-5555-4555-8555-555555555555",
            serviceId: "77777777-7777-4777-8777-777777777777",
            startsAt: `${date}T${String(12 + index).padStart(2, "0")}:00:00.000Z`,
            visitType: "regular",
            notes: "postgres-dashboard-test",
          });
          ids.push(created.id);
          dayIds.push(created.id);
          await pool.query(
            "UPDATE appointments SET status = $2 WHERE id = $1",
            [created.id, status],
          );
        }
        const dashboard = await repository.getDashboard(clinicId, date);
        expect(dashboard.appointmentsToday).toBe(7);
        expect(dashboard.nonCancelledAppointmentsToday).toBe(6);
        expect(dashboard.pendingToday).toBe(2);
        expect(dashboard.awaitingConfirmationToday).toBe(1);
        expect(dashboard.completedToday).toBe(1);
        expect(dashboard.nextAppointments.map((item) => item.id)).toEqual(
          dayIds.slice(0, 2),
        );
        expect(dashboard.nextAppointments.map((item) => item.status)).toEqual([
          "scheduled",
          "confirmed",
        ]);
        // Visualização da agenda por profissional: contadores e lista acompanham o filtro.
        const own = await repository.getDashboard(clinicId, date, [
          "33333333-3333-4333-8333-333333333333",
        ]);
        expect(own.appointmentsToday).toBe(7);
        expect(own.nextAppointments).toHaveLength(2);
        const other = await repository.getDashboard(clinicId, date, [
          "99999999-9999-4999-8999-999999999998",
        ]);
        expect(other.appointmentsToday).toBe(0);
        expect(other.pendingToday).toBe(0);
        expect(other.nextAppointments).toEqual([]);
      }
    } finally {
      await pool.query(
        "DELETE FROM appointments WHERE JSON_CONTAINS($1, JSON_QUOTE(id))",
        [ids],
      );
    }
  });

  it("lists past scheduled and confirmed appointments as pending finalization", async () => {
    const ids: string[] = [];
    try {
      for (const [index, status] of appointmentStatusSchema.options.entries()) {
        const created = await repository.createAppointment(clinicId, {
          patientId: "99999999-9999-4999-8999-999999999999",
          professionalId: "33333333-3333-4333-8333-333333333333",
          roomId: "55555555-5555-4555-8555-555555555555",
          serviceId: "77777777-7777-4777-8777-777777777777",
          startsAt: `2000-11-14T${String(12 + index).padStart(2, "0")}:00:00.000Z`,
          visitType: "regular",
          notes: "postgres-pending-finalization-test",
        });
        ids.push(created.id);
        await pool.query("UPDATE appointments SET status = $2 WHERE id = $1", [
          created.id,
          status,
        ]);
      }
      const future = await repository.createAppointment(clinicId, {
        patientId: "99999999-9999-4999-8999-999999999999",
        professionalId: "33333333-3333-4333-8333-333333333333",
        roomId: "55555555-5555-4555-8555-555555555555",
        serviceId: "77777777-7777-4777-8777-777777777777",
        startsAt: "2000-11-15T12:00:00.000Z",
        visitType: "regular",
        notes: "postgres-pending-finalization-test",
      });
      ids.push(future.id);
      const pending = (
        await repository.listPendingFinalizationAppointments(
          clinicId,
          "2000-11-15T00:00:00.000Z",
        )
      ).filter((item) => ids.includes(item.id));
      expect(pending.map((item) => item.id)).toEqual(ids.slice(0, 2));
      expect(
        (
          await repository.listPendingFinalizationAppointments(
            "00000000-0000-4000-8000-000000000000",
            "2000-11-15T00:00:00.000Z",
          )
        ).filter((item) => ids.includes(item.id)),
      ).toEqual([]);
    } finally {
      await pool.query(
        "DELETE FROM appointments WHERE JSON_CONTAINS($1, JSON_QUOTE(id))",
        [ids],
      );
    }
  });

  afterAll(async () => {
    await database?.drop();
  });

  it("lets MySQL reject concurrent schedule conflicts", async () => {
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
      visitType: "regular" as const,
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

  it("creates, lists by range and deletes holidays, one per date", async () => {
    const dates = ["2099-04-21", "2099-05-01"];
    await pool.query(
      "DELETE FROM holidays WHERE clinic_id = $1 AND JSON_CONTAINS($2, JSON_QUOTE(date))",
      [clinicId, dates],
    );
    const labor = await repository.createHoliday(clinicId, {
      date: dates[1]!,
      name: "Dia do Trabalho",
    });
    const tiradentes = await repository.createHoliday(clinicId, {
      date: dates[0]!,
      name: "Tiradentes",
    });
    expect(tiradentes).toMatchObject({
      clinicId,
      date: dates[0],
      name: "Tiradentes",
    });
    await expect(
      repository.createHoliday(clinicId, { date: dates[0]!, name: "Outro" }),
    ).rejects.toMatchObject({ code: "HOLIDAY_DUPLICATE" });
    expect(
      (await repository.listHolidays(clinicId, "2099-01-01", "2099-12-31")).map(
        (item) => item.id,
      ),
    ).toEqual([tiradentes.id, labor.id]);
    expect(
      await repository.listHolidays(clinicId, "2099-04-22", "2099-05-01"),
    ).toEqual([labor]);
    expect(
      (await repository.listHolidays(clinicId)).map((item) => item.id),
    ).toEqual(expect.arrayContaining([tiradentes.id, labor.id]));
    expect(await repository.deleteHoliday(clinicId, tiradentes.id)).toBe(true);
    expect(await repository.deleteHoliday(clinicId, tiradentes.id)).toBe(false);
    expect(await repository.deleteHoliday(clinicId, labor.id)).toBe(true);
  });

  it("records one satisfaction survey per completed appointment and filters by clinic date", async () => {
    await pool.query(
      `DELETE FROM satisfaction_surveys WHERE patient_id IN
       (SELECT id FROM patients WHERE clinic_id = $1 AND cpf = $2)`,
      [clinicId, satisfactionCpf],
    );
    await pool.query("DELETE FROM appointments WHERE notes = $1", [
      satisfactionMarker,
    ]);
    await pool.query("DELETE FROM patients WHERE clinic_id = $1 AND cpf = $2", [
      clinicId,
      satisfactionCpf,
    ]);
    const [professionals, rooms, services] = await Promise.all([
      repository.listProfessionals(clinicId),
      repository.listRooms(clinicId),
      repository.listServices(clinicId),
    ]);
    const patient = await repository.createPatient(clinicId, {
      fullName: "Cliente Satisfação",
      phone: "11933332222",
      cpf: satisfactionCpf,
      tags: [],
    });
    const startsAt = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000);
    startsAt.setUTCHours(13, 0, 0, 0);
    const appointment = await repository.createAppointment(clinicId, {
      patientId: patient.id,
      professionalId: professionals[0]!.id,
      roomId: rooms[0]!.id,
      serviceId: services[0]!.id,
      startsAt: startsAt.toISOString(),
      notes: satisfactionMarker,
      visitType: "regular",
    });
    await expect(
      repository.createSatisfactionSurvey(clinicId, ownerId, {
        patientId: patient.id,
        appointmentId: appointment.id,
        score: 9,
      }),
    ).rejects.toMatchObject({ code: "SATISFACTION_APPOINTMENT_NOT_COMPLETED" });
    // Realizado só vale a partir de 15 min antes do início (QC3).
    await atInstant(appointment.startsAt, () =>
      repository.updateAppointmentStatus(clinicId, appointment.id, "completed"),
    );
    const survey = await repository.createSatisfactionSurvey(
      clinicId,
      ownerId,
      {
        patientId: patient.id,
        appointmentId: appointment.id,
        score: 9,
        comment: "Gostei muito.",
      },
    );
    expect(survey).toMatchObject({
      patientName: "Cliente Satisfação",
      appointmentId: appointment.id,
      score: 9,
      comment: "Gostei muito.",
      actorUserId: ownerId,
    });
    await expect(
      repository.createSatisfactionSurvey(clinicId, ownerId, {
        patientId: patient.id,
        appointmentId: appointment.id,
        score: 2,
      }),
    ).rejects.toMatchObject({ code: "SATISFACTION_DUPLICATE" });
    const loose = await repository.createSatisfactionSurvey(clinicId, ownerId, {
      patientId: patient.id,
      score: 4,
    });
    expect(loose).not.toHaveProperty("appointmentId");
    const today = saoPauloToday();
    const mine = (
      await repository.listSatisfactionSurveys(clinicId, {
        from: today,
        to: today,
      })
    ).filter((item) => item.patientId === patient.id);
    expect(mine.map((item) => item.id)).toEqual([loose.id, survey.id]);
    expect(
      (
        await repository.listSatisfactionSurveys(clinicId, { to: "2000-01-01" })
      ).filter((item) => item.patientId === patient.id),
    ).toEqual([]);
  });
});
