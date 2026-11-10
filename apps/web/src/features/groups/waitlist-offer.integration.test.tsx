import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type GroupClass,
  type GroupEnrollment,
  type Patient,
} from "@crm/contracts";
import { api } from "../../api";
import { PlanGroupPicker } from "../../shared/components/PlanGroupPicker";
import { WaitlistContactModal } from "./WaitlistContactModal";
import { notificationGroups } from "../../app/notification-center";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const group: GroupClass = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  clinicId: "11111111-1111-4111-8111-111111111111",
  name: "Pilates A",
  sequence: 1,
  serviceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  serviceName: "Pilates",
  professionalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  professionalName: "Ana",
  roomId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  roomName: "Sala Pilates",
  active: true,
  capacity: 1,
  activeEnrollments: 1,
  waitlistCount: 1,
  weeklySlots: [],
  createdAt: "2026-11-06T12:00:00Z",
};
const enrollment: GroupEnrollment = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  clinicId: group.clinicId,
  groupId: group.id,
  patientId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  patientName: "Maria Silva",
  status: "waitlisted",
  queuePosition: 1,
  enrolledAt: group.createdAt,
  updatedAt: group.createdAt,
  startsOn: "2026-11-06",
};

describe("oferta de vaga em turma", () => {
  it("asks before selecting a full group and leaves the choice unchanged when cancelled", async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <PlanGroupPicker
          groups={{ items: [group], error: "", retry: vi.fn() }}
          services={[{ serviceId: group.serviceId }]}
          value=""
          onChange={onChange}
        />
      </form>,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: group.id },
    });
    const dialog = screen.getByRole("dialog", { name: "Turma cheia" });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Voltar" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: group.id },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Sim, colocar na lista de espera" }),
    );
    expect(onChange).toHaveBeenCalledWith(group.id);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("opens contact details and only enrolls after an explicit acceptance confirmation", async () => {
    vi.spyOn(api, "patient").mockResolvedValue({
      fullName: enrollment.patientName,
      phone: "11999998888",
      whatsapp: "11999998888",
    } as Patient);
    const confirm = vi
      .spyOn(api, "confirmGroupEnrollment")
      .mockResolvedValue({ ...enrollment, status: "active" });
    const onConfirmed = vi.fn().mockResolvedValue(undefined);
    render(
      <WaitlistContactModal
        group={{ ...group, activeEnrollments: 0 }}
        enrollment={enrollment}
        canConfirm
        onClose={vi.fn()}
        onConfirmed={onConfirmed}
      />,
    );
    const contact = await screen.findByRole("link", {
      name: "Oferecer vaga pelo WhatsApp",
    });
    expect(contact).toHaveAttribute(
      "href",
      expect.stringContaining("11999998888"),
    );
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Cliente aceitou: confirmar matrícula",
      }),
    );
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Confirmar matrícula?" }),
      ).getByRole("button", { name: "Confirmar matrícula" }),
    );
    await vi.waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(confirm).toHaveBeenCalledWith(enrollment.id);
  });

  it("links each vacancy alert to the waiting client's contact modal", () => {
    const vacancy = {
      groupId: group.id,
      groupName: group.name,
      vacancies: 1,
      waiting: 1,
      enrollmentId: enrollment.id,
      patientId: enrollment.patientId,
      patientName: enrollment.patientName,
    };
    const [alert] = notificationGroups(
      { date: "2026-11-06", groupVacancies: [vacancy] },
      () => true,
    );
    expect(alert).toMatchObject({
      to: `/turmas?oferecer=${enrollment.id}`,
      count: 1,
    });
    expect(alert?.label).toContain("1 vaga disponível");
    expect(
      notificationGroups(
        { date: "2026-11-06", groupVacancies: [] },
        () => true,
      ),
    ).toEqual([]);
  });
});
