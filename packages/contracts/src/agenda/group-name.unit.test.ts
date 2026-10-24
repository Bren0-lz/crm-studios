import { describe, expect, it } from "vitest";
import { groupClassInputSchema, groupClassRenameSchema } from "./model.js";

const input = {
  serviceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  professionalId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  capacity: 4,
  weeklySlots: [{ weekday: 2, startTime: "18:00", endTime: "19:00" }],
};

describe("group names", () => {
  it("keeps creation compatible and trims custom names", () => {
    expect(groupClassInputSchema.parse(input)).not.toHaveProperty("name");
    expect(
      groupClassInputSchema.parse({ ...input, name: "  Pilates manhã  " }).name,
    ).toBe("Pilates manhã");
    expect(groupClassRenameSchema.parse({ name: "  Pilates manhã  " })).toEqual(
      { name: "Pilates manhã" },
    );
    expect(
      groupClassRenameSchema.safeParse({ name: "a".repeat(120) }).success,
    ).toBe(true);
  });

  it.each(["", "   ", "a".repeat(121), null, 42])(
    "rejects invalid custom name %s",
    (name) => {
      expect(groupClassInputSchema.safeParse({ ...input, name }).success).toBe(
        false,
      );
      expect(groupClassRenameSchema.safeParse({ name }).success).toBe(false);
    },
  );

  it("requires a name and refuses other changes in the rename endpoint", () => {
    expect(groupClassRenameSchema.safeParse({}).success).toBe(false);
    expect(
      groupClassRenameSchema.safeParse({ name: "Pilates", capacity: 10 })
        .success,
    ).toBe(false);
  });
});
