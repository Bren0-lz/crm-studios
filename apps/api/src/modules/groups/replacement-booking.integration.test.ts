import { nextTestCpf } from "../../test-support/cpf.js";
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
  // 01/01/2039 é sábado; os encontros de terça às 18h caem em 04, 11, 18, 25/01…
  at("2039-01-01T12:00:00Z");
  const repository = new MemoryClinicRepository();
  const [professional] = await repository.listProfessionals(clinicId),
    [room] = await repository.listRooms(clinicId),
    [service] = await repository.listServices(clinicId);
  const group = await repository.createGroupClass(clinicId, {
    serviceId: service!.id,
    professionalId: professional!.id,
    roomId: room!.id,
    capacity: 1,
    weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
  });
  const patient = await repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Bruna Reposição",
    phone: "11988887777",
    tags: [],
  });
  await repository.createGroupEnrollment(clinicId, {
    groupId: group.id,
    patientId: patient.id,
  });
  const workspace = await repository.getGroupWorkspace(
    clinicId,
    "2039-01-01T00:00:00Z",
    "2039-03-01T00:00:00Z",
  );
  const sessions = workspace.sessions.filter(
    (item) => item.groupId === group.id,
  );
  const sessionOn = (date: string) =>
    sessions.find((item) => item.startsAt.startsWith(date))!;
  const creditFor = async (date: string) => {
    await repository.recordGroupAttendance(
      clinicId,
      actorId,
      sessionOn(date).id,
      patient.id,
      { status: "excused_absence" },
    );
    return (
      await repository.getGroupWorkspace(
        clinicId,
        "2039-01-01T00:00:00Z",
        "2039-03-01T00:00:00Z",
      )
    ).replacementCredits.find(
      (item) =>
        item.patientId === patient.id &&
        item.sourceSessionId === sessionOn(date).id,
    )!;
  };
  return { repository, sessionOn, creditFor };
}

describe("replacement booking target", () => {
  it("refuses a session that already started and accepts a future one", async () => {
    const { repository, sessionOn, creditFor } = await setup();
    const credit = await creditFor("2039-01-04");
    // 11/01 às 18h30 em São Paulo: o encontro de 11/01 já começou.
    at("2039-01-11T21:30:00Z");
    for (const date of ["2039-01-04", "2039-01-11"])
      await expect(
        repository.bookReplacement(clinicId, actorId, {
          creditId: credit.id,
          sessionId: sessionOn(date).id,
        }),
      ).rejects.toMatchObject({ code: "REPLACEMENT_NOT_AVAILABLE" });
    await expect(
      repository.bookReplacement(clinicId, actorId, {
        creditId: credit.id,
        sessionId: sessionOn("2039-01-11").id,
      }),
    ).rejects.toThrow("Escolha um encontro futuro.");
    await expect(
      repository.bookReplacement(clinicId, actorId, {
        creditId: credit.id,
        sessionId: sessionOn("2039-01-18").id,
      }),
    ).resolves.toMatchObject({
      credit: { status: "used", usedSessionId: sessionOn("2039-01-18").id },
    });
  });

  it("refuses the session where the credit was generated, even in the future", async () => {
    const { repository, sessionOn, creditFor } = await setup();
    const credit = await creditFor("2039-01-18");
    await expect(
      repository.bookReplacement(clinicId, actorId, {
        creditId: credit.id,
        sessionId: sessionOn("2039-01-18").id,
      }),
    ).rejects.toThrow(
      "A reposição precisa ser em outro encontro, não no da falta.",
    );
    const workspace = await repository.getGroupWorkspace(
      clinicId,
      "2039-01-01T00:00:00Z",
      "2039-03-01T00:00:00Z",
    );
    expect(
      workspace.replacementCredits.find((item) => item.id === credit.id)
        ?.status,
    ).toBe("available");
  });
});
