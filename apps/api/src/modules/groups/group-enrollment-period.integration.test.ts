import { nextTestCpf } from "../../test-support/cpf.js";
import { groupEnrollmentCoversSession } from "@crm/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryClinicRepository } from "../../memory-repository.js";

const clinicId = "11111111-1111-4111-8111-111111111111",
  actorId = "22222222-2222-4222-8222-222222222222";

afterEach(() => vi.useRealTimers());

function at(instant: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(instant));
}

async function setup() {
  // 01/01/2039 é sábado; os encontros de terça às 18h caem em 04, 11, 18, 25/01, 01/02…
  at("2039-01-01T12:00:00Z");
  const repository = new MemoryClinicRepository();
  const [professional] = await repository.listProfessionals(clinicId),
    [room] = await repository.listRooms(clinicId),
    [service] = await repository.listServices(clinicId);
  const patient = (fullName: string) =>
    repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName,
      phone: "11988887777",
      tags: [],
    });
  const group = (capacity: number, weekday: number) =>
    repository.createGroupClass(clinicId, {
      serviceId: service!.id,
      professionalId: professional!.id,
      roomId: room!.id,
      capacity,
      weeklySlots: [{ weekday, startTime: "18:00", endTime: "19:00" }],
    });
  const sessionsOf = async (groupId: string) => {
    const workspace = await repository.getGroupWorkspace(
      clinicId,
      "2039-01-01T00:00:00Z",
      "2039-03-01T00:00:00Z",
    );
    const sessions = workspace.sessions.filter(
      (item) => item.groupId === groupId,
    );
    return (date: string) =>
      sessions.find((item) => item.startsAt.startsWith(date))!;
  };
  return { repository, patient, group, sessionsOf };
}

describe("group enrollment period", () => {
  it("starts on the chosen date and records attendance only inside the period", async () => {
    const { repository, patient, group, sessionsOf } = await setup();
    const tuesday = await group(1, 2);
    const ana = await patient("Ana Período");
    const sessionOn = await sessionsOf(tuesday.id);
    const enrollment = await repository.createGroupEnrollment(clinicId, {
      groupId: tuesday.id,
      patientId: ana.id,
      startsOn: "2039-01-15",
    });
    expect(enrollment.startsOn).toBe("2039-01-15");
    expect(enrollment.endedOn).toBeUndefined();
    expect(
      groupEnrollmentCoversSession(enrollment, sessionOn("2039-01-11")),
    ).toBe(false);
    expect(
      groupEnrollmentCoversSession(enrollment, sessionOn("2039-01-18")),
    ).toBe(true);
    await expect(
      repository.recordGroupAttendance(
        clinicId,
        actorId,
        sessionOn("2039-01-11").id,
        ana.id,
        { status: "absent" },
      ),
    ).rejects.toMatchObject({ code: "GROUP_ATTENDANCE_NOT_ALLOWED" });
    await expect(
      repository.recordGroupAttendance(
        clinicId,
        actorId,
        sessionOn("2039-01-18").id,
        ana.id,
        { status: "absent" },
      ),
    ).resolves.toMatchObject({ status: "absent" });

    at("2039-01-27T12:00:00Z");
    const cancelled = await repository.cancelGroupEnrollment(
      clinicId,
      enrollment.id,
    );
    expect(cancelled).toMatchObject({
      status: "cancelled",
      startsOn: "2039-01-15",
      endedOn: "2039-01-27",
    });
    await expect(
      repository.recordGroupAttendance(
        clinicId,
        actorId,
        sessionOn("2039-01-25").id,
        ana.id,
        { status: "absent" },
      ),
    ).resolves.toMatchObject({ status: "absent" });
    await expect(
      repository.recordGroupAttendance(
        clinicId,
        actorId,
        sessionOn("2039-02-01").id,
        ana.id,
        { status: "absent" },
      ),
    ).rejects.toMatchObject({ code: "GROUP_ATTENDANCE_NOT_ALLOWED" });
    const workspace = await repository.getGroupWorkspace(
      clinicId,
      "2039-01-01T00:00:00Z",
      "2039-03-01T00:00:00Z",
    );
    expect(
      workspace.enrollments.find((item) => item.id === enrollment.id),
    ).toMatchObject({ startsOn: "2039-01-15", endedOn: "2039-01-27" });
  });

  it("defaults the start to today in the clinic time zone", async () => {
    const { repository, patient, group } = await setup();
    const tuesday = await group(1, 2);
    // 02/01 às 02h UTC ainda é 01/01 às 23h em São Paulo.
    at("2039-01-02T02:00:00Z");
    const enrollment = await repository.createGroupEnrollment(clinicId, {
      groupId: tuesday.id,
      patientId: (await patient("Bia Hoje")).id,
    });
    expect(enrollment.startsOn).toBe("2039-01-01");
  });

  it("counts the seats of a session by the enrollment period", async () => {
    const { repository, patient, group, sessionsOf } = await setup();
    const tuesday = await group(1, 2);
    const thursday = await group(1, 4);
    const ana = await patient("Ana Lotação"),
      bia = await patient("Bia Reposição");
    await repository.createGroupEnrollment(clinicId, {
      groupId: tuesday.id,
      patientId: ana.id,
      startsOn: "2039-01-20",
    });
    await repository.createGroupEnrollment(clinicId, {
      groupId: thursday.id,
      patientId: bia.id,
    });
    const tuesdayOn = await sessionsOf(tuesday.id),
      thursdayOn = await sessionsOf(thursday.id);
    for (const date of ["2039-01-06", "2039-01-13"])
      await repository.recordGroupAttendance(
        clinicId,
        actorId,
        thursdayOn(date).id,
        bia.id,
        { status: "excused_absence" },
      );
    const credits = (
      await repository.getGroupWorkspace(
        clinicId,
        "2039-01-01T00:00:00Z",
        "2039-03-01T00:00:00Z",
      )
    ).replacementCredits.filter(
      (item) => item.patientId === bia.id && item.status === "available",
    );
    expect(credits).toHaveLength(2);
    // Antes do início da Ana a vaga da turma de terça está livre.
    await expect(
      repository.bookReplacement(clinicId, actorId, {
        creditId: credits[0]!.id,
        sessionId: tuesdayOn("2039-01-11").id,
      }),
    ).resolves.toMatchObject({ credit: { status: "used" } });
    await expect(
      repository.bookReplacement(clinicId, actorId, {
        creditId: credits[1]!.id,
        sessionId: tuesdayOn("2039-01-25").id,
      }),
    ).rejects.toMatchObject({ code: "GROUP_SESSION_FULL" });
  });
});
