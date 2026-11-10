import type { AgendaNoteInput } from "@crm/contracts";
import { expect } from "vitest";
import type { ClinicRepository } from "../repository.js";

export const noteClinicId = "11111111-1111-4111-8111-111111111111";
export const noteOwnerId = "22222222-2222-4222-8222-222222222222";
export const noteInput: AgendaNoteInput = {
  description: "Teste S01",
  professionalId: null,
  backgroundColor: "#facc15",
  startsAt: "2038-10-23T12:00:00.000Z",
  endsAt: "2038-10-23T13:00:00.000Z",
  repeat: { until: "2038-10-30", weekdays: [1, 5, 6] },
};
export async function verifyAgendaNotesRepository(
  repository: ClinicRepository,
) {
  const clinicId = noteClinicId,
    actor = noteOwnerId;
  const created = await repository.createAgendaNotes(
    clinicId,
    actor,
    noteInput,
  );
  const ids = created.map((item) => item.id);
  expect(created.length).toBeGreaterThan(2);
  expect(new Set(created.map((item) => item.seriesId)).size).toBe(1);
  expect(
    created.every(
      (item) => item.authorUserId === actor && item.clinicId === clinicId,
    ),
  ).toBe(true);
  const list = () =>
    repository.listAgendaNotes(
      clinicId,
      "2038-10-01T00:00:00Z",
      "2038-11-15T00:00:00Z",
    );
  expect((await list()).filter((item) => ids.includes(item.id))).toHaveLength(
    created.length,
  );
  await repository.branchScope.run({ branchIds: [] }, async () => {
    expect(await list()).toEqual([]);
    expect(
      await repository.deleteAgendaNote(
        clinicId,
        actor,
        created[0]!.id,
        "following",
      ),
    ).toBe(false);
    expect(
      await repository.updateAgendaNote(
        clinicId,
        actor,
        created[0]!.id,
        noteInput,
        "this",
      ),
    ).toBeNull();
  });
  expect(
    await repository.listAgendaNotes(
      "99999999-9999-4999-8999-999999999999",
      "2038-10-01T00:00:00Z",
      "2038-11-15T00:00:00Z",
    ),
  ).toEqual([]);
  const update = {
    professionalId: noteInput.professionalId,
    description: noteInput.description,
    backgroundColor: noteInput.backgroundColor,
    startsAt: noteInput.startsAt,
    endsAt: noteInput.endsAt,
  };
  const edited = await repository.updateAgendaNote(
    clinicId,
    actor,
    created[0]!.id,
    { ...update, description: "Só a primeira" },
    "this",
  );
  expect(edited).toHaveLength(1);
  expect(edited![0]!.seriesId).toBeNull();
  expect(
    (await list()).find((item) => item.id === created[1]!.id)?.description,
  ).toBe("Teste S01");
  const next = await repository.updateAgendaNote(
    clinicId,
    actor,
    created[1]!.id,
    {
      ...update,
      startsAt: created[1]!.startsAt,
      endsAt: created[1]!.endsAt,
      description: "Próximas",
      backgroundColor: "#276749",
    },
    "following",
  );
  expect(next).toHaveLength(created.length - 1);
  expect(
    next!.every(
      (item) =>
        item.description === "Próximas" && item.backgroundColor === "#276749",
    ),
  ).toBe(true);
  expect(
    await repository.deleteAgendaNote(
      clinicId,
      actor,
      created[1]!.id,
      "following",
    ),
  ).toBe(true);
  expect((await list()).filter((item) => ids.includes(item.id))).toHaveLength(
    1,
  );
  await repository.deleteAgendaNote(clinicId, actor, created[0]!.id, "this");
  expect((await list()).filter((item) => ids.includes(item.id))).toEqual([]);
  const events = (await repository.listAdminAuditEvents(clinicId)).filter(
    (item) => ids.includes(item.entityId ?? ""),
  );
  expect(
    events.filter((item) => item.action === "agenda.note_created"),
  ).toHaveLength(created.length);
  expect(
    events.filter((item) => item.action === "agenda.note_updated"),
  ).toHaveLength(created.length);
  expect(
    events.filter((item) => item.action === "agenda.note_deleted"),
  ).toHaveLength(created.length);
  await expect(
    repository.createAgendaNotes(clinicId, actor, {
      ...noteInput,
      repeat: { until: "2039-10-30", weekdays: [0, 1, 2, 3, 4, 5, 6] },
    }),
  ).rejects.toThrow("120");
  expect((await list()).filter((item) => ids.includes(item.id))).toEqual([]);
}
