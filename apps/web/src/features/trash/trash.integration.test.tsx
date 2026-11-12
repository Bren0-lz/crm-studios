import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { PermissionKey } from "@crm/contracts";
import { describe, expect, it } from "vitest";
import { nextTestCpf } from "../../../../api/src/test-support/cpf.js";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { open } from "../../test-support/workflow-ui";

async function seed() {
  const api = await setupApi();
  const patient = await api.repository.createPatient(clinicId, {
    cpf: nextTestCpf(),
    fullName: "Elisa Lixeira",
    phone: "11988887777",
    tags: [],
  });
  return { ...api, patient };
}

async function signInAs(
  api: Awaited<ReturnType<typeof setupApi>>,
  permissions: PermissionKey[],
) {
  const user = await api.repository.createAdminUser(
    clinicId,
    actorId,
    {
      fullName: "Recepção",
      email: `recepcao.${nextTestCpf()}@example.com`,
      role: "user",
      password: "SenhaForte123",
      permissions,
    },
    "hash-de-teste",
  );
  const token = api.app.jwt.sign({ sub: user.id, clinicId, role: "user" });
  const me = await api.app.inject({
    url: "/me",
    headers: { authorization: `Bearer ${token}` },
  });
  localStorage.setItem("crm.auth.token", token);
  localStorage.setItem("crm.auth.user", me.body);
}

async function openPatientsTrash() {
  fireEvent.click(await screen.findByRole("button", { name: "Abrir lixeira" }));
  return screen.findByRole("dialog", { name: "Lixeira" });
}

describe("lixeira", () => {
  it("envia o cliente para a lixeira e o restaura como estava", async () => {
    const { patient, repository } = await seed();
    open(`/clientes/${patient.id}`);
    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));
    const confirm = await screen.findByRole("dialog", { name: "Excluir" });
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Enviar para a lixeira" }),
    );
    await waitFor(async () =>
      expect(
        (await repository.listTrash(clinicId, "patients")).map(
          (item) => item.id,
        ),
      ).toEqual([patient.id]),
    );
    const trash = await openPatientsTrash();
    expect(await within(trash).findByText("Elisa Lixeira")).toBeInTheDocument();
    fireEvent.click(within(trash).getByRole("button", { name: "Restaurar" }));
    expect(await within(trash).findByText("Lixeira vazia")).toBeInTheDocument();
    expect(await repository.getPatient(clinicId, patient.id)).toMatchObject({
      fullName: "Elisa Lixeira",
    });
  });

  it("avisa o que será apagado e só exclui de vez depois de digitar EXCLUIR", async () => {
    const { patient, repository } = await seed();
    await repository.sendToTrash(clinicId, actorId, "patients", patient.id);
    open("/clientes");
    const trash = await openPatientsTrash();
    fireEvent.click(
      await within(trash).findByRole("button", {
        name: "Excluir em definitivo",
      }),
    );
    const purge = await screen.findByRole("dialog", {
      name: "Excluir em definitivo",
    });
    expect(
      within(purge).getByText("Esta exclusão não pode ser desfeita."),
    ).toBeInTheDocument();
    expect(
      await within(purge).findByText(
        "Nenhum outro registro está ligado a este item.",
      ),
    ).toBeInTheDocument();
    const submit = within(purge).getByRole("button", {
      name: "Excluir em definitivo",
    });
    expect(submit).toBeDisabled();
    fireEvent.change(within(purge).getByLabelText(/Para confirmar/), {
      target: { value: "excluir" },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(await within(trash).findByText("Lixeira vazia")).toBeInTheDocument();
    expect(await repository.listTrash(clinicId, "patients")).toEqual([]);
  });

  it("esconde os botões de quem não tem as permissões da lixeira", async () => {
    const api = await seed();
    await signInAs(api, ["patients.view", "patients.update"]);
    open(`/clientes/${api.patient.id}`);
    await screen.findByRole("button", { name: "Editar cadastro" });
    expect(
      screen.queryByRole("button", { name: "Excluir" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Abrir lixeira" }),
    ).not.toBeInTheDocument();
    cleanup();
    open("/clientes");
    await screen.findByRole("heading", { name: "Clientes" });
    expect(
      screen.queryByRole("button", { name: "Abrir lixeira" }),
    ).not.toBeInTheDocument();
  });

  it("mostra só o ícone de abrir a lixeira para quem vê a lixeira sem poder excluir", async () => {
    const api = await seed();
    await signInAs(api, ["patients.view", "patients.update", "trash.view"]);
    open("/clientes");
    const button = await screen.findByRole("button", { name: "Abrir lixeira" });
    expect(button).toHaveClass("trash-icon-button");
    expect(button).toHaveTextContent("");
    cleanup();
    open(`/clientes/${api.patient.id}`);
    await screen.findByRole("button", { name: "Editar cadastro" });
    expect(
      screen.queryByRole("button", { name: "Excluir" }),
    ).not.toBeInTheDocument();
  });
});
