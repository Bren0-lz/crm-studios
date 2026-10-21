import type { GroupSession } from "@crm/contracts";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  type Authorization,
  AuthorizationContext,
} from "../../authorization-context";
import "../../test-support/legacy-setup";
import { GroupSessionCard } from "./GroupSessionCard";

const authorization: Authorization = {
  user: null,
  checking: false,
  setUser: () => undefined,
  logout: () => undefined,
  can: () => true,
  canView: () => true,
  canEdit: () => true,
};

const longName =
  "Dançaterapia Turma Avançada de Quinta-feira à noite com coreografia";

const session: GroupSession = {
  id: "s1",
  clinicId: "c1",
  groupId: "g1",
  groupName: longName,
  professionalId: "p1",
  professionalName: "Clara Mendes",
  roomId: "r1",
  roomName: "Sala de Dança",
  startsAt: "2026-10-16T21:00:00.000Z",
  endsAt: "2026-10-16T22:00:00.000Z",
  status: "scheduled",
  attendanceCount: 0,
  createdAt: "2026-10-01T12:00:00.000Z",
};

function renderCard(compact: boolean) {
  render(
    <AuthorizationContext.Provider value={authorization}>
      <MemoryRouter>
        <GroupSessionCard session={session} compact={compact} />
      </MemoryRouter>
    </AuthorizationContext.Provider>,
  );
}

describe("group name on agenda cards (V8)", () => {
  it("wraps the group name in up to two lines and keeps the full name in the title", () => {
    renderCard(true);
    const compact = screen.getByText(longName);
    expect(compact).toHaveClass("group-name");
    expect(compact).toHaveAttribute("title", longName);
  });

  it("does the same on the list card", () => {
    renderCard(false);
    const name = screen.getByRole("heading", { name: longName });
    expect(name).toHaveClass("group-name");
    expect(name).toHaveAttribute("title", longName);
  });

  it("clamps .group-name in two lines and lets the lead stage fill the card row (CSS)", () => {
    const styles = (name: string) =>
      readFileSync(`${process.cwd()}/src/styles/${name}`, "utf8");
    expect(styles("05-agenda.css")).toMatch(
      /\.group-name,[^{]*\{[^}]*-webkit-line-clamp: 2;/,
    );
    expect(styles("10-commercial-communications.css")).toMatch(
      /\.lead-card \.lead-card-actions select \{[^}]*flex: 1;/,
    );
  });
});
