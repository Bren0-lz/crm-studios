import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

/** Turma de 1 vaga: Ana matriculada, Bruno e Carla na espera da turma (RE14). */
async function seed() {
  const api = await setupApi();
  const { repository } = api;
  const patient = (fullName: string) =>
    repository.createPatient(clinicId, {
      cpf: nextTestCpf(),
      fullName,
      phone: "11988887777",
      whatsapp: "11988887777",
      tags: [],
    });
  const ana = await patient("Ana Turma");
  const bruno = await patient("Bruno Turma");
  const carla = await patient("Carla Turma");
  const [service] = await repository.listServices(clinicId);
  const [professional] = await repository.listProfessionals(clinicId);
  const room = (await repository.listRooms(clinicId)).find(
    (item) => item.capacity >= 3,
  );
  const group = await repository.createGroupClass(clinicId, {
    name: "TESTE Turma",
    serviceId: service!.id,
    professionalId: professional!.id,
    roomId: room!.id,
    capacity: 1,
    // Fora dos horários dos atendimentos demo.
    weeklySlots: [{ weekday: 0, startTime: "20:00", endTime: "21:00" }],
  });
  const enroll = (patientId: string) =>
    repository.createGroupEnrollment(clinicId, {
      groupId: group.id,
      patientId,
    });
  const active = await enroll(ana.id);
  const brunoWait = await enroll(bruno.id);
  const carlaWait = await enroll(carla.id);
  return {
    ...api,
    ana,
    bruno,
    carla,
    service: service!,
    group,
    active,
    brunoWait,
    carlaWait,
  };
}

async function clientsList() {
  return screen.findByRole("region", { name: "Clientes na lista de espera" });
}

describe("espera das turmas na Lista de espera (RE14)", () => {
  it("mostra a espera da turma com posição, conta o cliente uma vez e filtra", async () => {
    const { repository, bruno, carla, service } = await seed();
    // Bruno também está na lista do serviço: na procura ele conta uma vez só.
    await repository.createWaitlistEntry(clinicId, actorId, {
      patientId: bruno.id,
      kind: "service",
      serviceId: service.id,
      productId: null,
      notes: "",
    });
    open("/lista-de-espera");
    const list = await clientsList();
    const carlaRow = (await within(list).findByText(carla.fullName)).closest(
      "tr",
    )!;
    expect(
      within(carlaRow).getByText(`Espera da turma · ${service.name}`),
    ).toBeInTheDocument();
    expect(within(carlaRow).getByText("TESTE Turma")).toBeInTheDocument();
    expect(within(carlaRow).getByText("2º")).toBeInTheDocument();
    expect(within(carlaRow).getByText("Aguardando")).toBeInTheDocument();
    expect(
      within(carlaRow).getByText(/Na espera da turma desde/),
    ).toBeInTheDocument();
    // Turma cheia: sem oferta de vaga, mas dá para remover da espera.
    expect(
      within(list).queryByRole("button", { name: /Oferecer a vaga/ }),
    ).not.toBeInTheDocument();
    expect(within(list).getAllByRole("row").slice(1)).toHaveLength(3);
    expect(within(list).getByText("3 entradas · na fila")).toBeInTheDocument();

    const overview = screen.getByRole("region", { name: "Maior procura" });
    const demandRows = within(overview).getAllByRole("row").slice(1);
    expect(demandRows).toHaveLength(1);
    expect(within(demandRows[0]!).getByText(service.name)).toBeInTheDocument();
    expect(within(demandRows[0]!).getAllByRole("cell")[1]!.textContent).toBe(
      "2",
    );

    // Filtros valem para as duas listas.
    fireEvent.change(within(list).getByPlaceholderText("Buscar pelo nome"), {
      target: { value: "Carla" },
    });
    expect(within(list).getAllByRole("row").slice(1)).toHaveLength(1);
    fireEvent.change(within(list).getByPlaceholderText("Buscar pelo nome"), {
      target: { value: "" },
    });
    fireEvent.change(within(list).getByLabelText("Situação"), {
      target: { value: "contacted" },
    });
    expect(within(list).queryByText(carla.fullName)).not.toBeInTheDocument();
    fireEvent.change(within(list).getByLabelText("Situação"), {
      target: { value: "queue" },
    });
    fireEvent.change(within(list).getByLabelText("Item"), {
      target: { value: `service:${service.id}` },
    });
    expect(within(list).getAllByRole("row").slice(1)).toHaveLength(3);
  });

  it("oferece a vaga pelo mesmo contato do alerta e remove da espera com confirmação", async () => {
    const { repository, active, bruno, carla, brunoWait, carlaWait } =
      await seed();
    // A vaga abre sem promover ninguém.
    await repository.cancelGroupEnrollment(clinicId, active.id);
    open("/lista-de-espera");
    const list = await clientsList();
    const offerButton = await within(list).findByRole("button", {
      name: `Oferecer a vaga a ${bruno.fullName}`,
    });
    // Com 1 vaga, só o 1º da fila recebe a oferta (como o alerta do topo).
    const waitingRow = within(list).getByText(carla.fullName).closest("tr")!;
    expect(
      within(waitingRow).queryByRole("button", { name: /Oferecer a vaga/ }),
    ).not.toBeInTheDocument();
    expect(within(waitingRow).getByText(/aguardando vaga/)).toBeInTheDocument();
    expect(within(waitingRow).queryByText(/vaga aberta/)).toBeNull();
    expect(
      within(offerButton.closest("tr")!).getByText(/vaga aberta/),
    ).toBeInTheDocument();
    fireEvent.click(offerButton);
    const offer = await screen.findByRole("dialog", { name: bruno.fullName });
    expect(
      await within(offer).findByRole("link", {
        name: "Oferecer vaga pelo WhatsApp",
      }),
    ).toHaveAttribute("href", expect.stringContaining("wa.me/5511988887777"));
    fireEvent.click(
      within(offer).getByRole("button", {
        name: "Cliente aceitou: confirmar matrícula",
      }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Confirmar matrícula?",
    });
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Confirmar matrícula" }),
    );
    await waitFor(() =>
      expect(within(list).queryByText(bruno.fullName)).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText("Matrícula confirmada após aceite do cliente."),
    ).toBeInTheDocument();

    // Carla sobe para 1º; a turma voltou a ficar cheia, então não há oferta.
    const carlaRow = within(list).getByText(carla.fullName).closest("tr")!;
    expect(within(carlaRow).getByText("1º")).toBeInTheDocument();
    expect(
      within(carlaRow).queryByRole("button", { name: /Oferecer a vaga/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(carlaRow).getByRole("button", {
        name: `Remover ${carla.fullName} da espera da turma`,
      }),
    );
    const removal = await screen.findByRole("dialog", {
      name: "Remover da espera da turma?",
    });
    fireEvent.click(
      within(removal).getByRole("button", { name: "Remover da espera" }),
    );
    await waitFor(() =>
      expect(within(list).queryByText(carla.fullName)).not.toBeInTheDocument(),
    );
    const workspace = await repository.getGroupWorkspace(
      clinicId,
      new Date().toISOString(),
      new Date().toISOString(),
    );
    const status = (id: string) =>
      workspace.enrollments.find((item) => item.id === id)?.status;
    expect([status(brunoWait.id), status(carlaWait.id)]).toEqual([
      "active",
      "cancelled",
    ]);
  });

  it("com 2 vagas, oferece aos dois primeiros da fila", async () => {
    const { repository, active, bruno, carla, group } = await seed();
    await repository.cancelGroupEnrollment(clinicId, active.id);
    await repository.updateGroupClass(clinicId, group.id, {
      capacity: 2,
      weeklySlots: group.weeklySlots,
    });
    open("/lista-de-espera");
    const list = await clientsList();
    for (const patient of [bruno, carla])
      expect(
        await within(list).findByRole("button", {
          name: `Oferecer a vaga a ${patient.fullName}`,
        }),
      ).toBeInTheDocument();
  });

  it("sem gerenciar a lista de espera, mostra a espera da turma sem ações", async () => {
    const { app, repository, active, carla } = await seed();
    await repository.cancelGroupEnrollment(clinicId, active.id);
    const user = await repository.createAdminUser(
      clinicId,
      actorId,
      {
        fullName: "Equipe Consulta",
        email: "consulta-espera@example.com",
        role: "user",
        password: "SenhaForte123",
        permissions: ["waitlist.view"] as never,
      },
      "hash-de-teste",
    );
    const token = app.jwt.sign({ sub: user.id, clinicId, role: "user" });
    const me = await app.inject({
      url: "/me",
      headers: { authorization: `Bearer ${token}` },
    });
    localStorage.setItem("crm.auth.token", token);
    localStorage.setItem("crm.auth.user", me.body);
    open("/lista-de-espera");
    const list = await clientsList();
    expect(await within(list).findByText(carla.fullName)).toBeInTheDocument();
    expect(
      within(list).queryByRole("button", { name: /Oferecer a vaga/ }),
    ).not.toBeInTheDocument();
    expect(
      within(list).queryByRole("button", { name: /da espera da turma/ }),
    ).not.toBeInTheDocument();
  });
});
