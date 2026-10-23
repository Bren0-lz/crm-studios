import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actorId, clinicId, setupApi } from "../../test-support/api-server";
import { change, open } from "../../test-support/workflow-ui";

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PROFESSIONAL_ID = "33333333-3333-4333-8333-333333333333";

function pngFile() {
  const bytes = Uint8Array.from(atob(PNG_BASE64), (char) => char.charCodeAt(0));
  return new File([bytes], "foto.png", { type: "image/png" });
}

describe("own profile through real HTTP handlers", () => {
  it("opens from the user menu and saves name, photo and agenda name", async () => {
    const { repository } = await setupApi();
    await repository.setAdminUserProfessional(
      clinicId,
      actorId,
      actorId,
      PROFESSIONAL_ID,
    );
    open("/");
    fireEvent.click(
      await screen.findByRole("button", { name: "Menu do usuário" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Meu perfil/ }));
    await screen.findByRole("heading", { name: "Meu perfil" });
    const data = await screen.findByRole("region", { name: "Dados pessoais" });
    expect(within(data).getByLabelText("E-mail de acesso")).toHaveValue(
      "admin@movimenta.local",
    );
    expect(within(data).getByLabelText("Nome na agenda")).toHaveValue(
      "Dra. Ana Martins",
    );
    const save = within(data).getByRole("button", { name: "Salvar perfil" });
    expect(save).toBeDisabled();

    change("Nome completo", "Aryana Dutra Lima", data);
    change("Nome na agenda", "Aryana", data);
    fireEvent.change(within(data).getByLabelText("Foto"), {
      target: { files: [pngFile()] },
    });
    await within(data).findByRole("img", { name: "Sua foto" });
    fireEvent.click(save);
    await within(data).findByText("Perfil salvo.");

    const profile = await repository.getOwnProfile(clinicId, actorId);
    expect(profile).toMatchObject({
      fullName: "Aryana Dutra Lima",
      avatarDataUrl: `data:image/png;base64,${PNG_BASE64}`,
      professional: { fullName: "Aryana" },
    });
    // O cabeçalho passa a mostrar a foto no lugar das iniciais.
    const menu = screen.getByRole("button", { name: "Menu do usuário" });
    expect(menu.querySelector("img")).not.toBeNull();
  });

  it("explains when the user has no professional in the agenda", async () => {
    await setupApi();
    open("/perfil");
    const data = await screen.findByRole("region", { name: "Dados pessoais" });
    expect(
      within(data).getByText(/não está ligado a um profissional da agenda/),
    ).toBeInTheDocument();
    expect(within(data).queryByLabelText("Nome na agenda")).toBeNull();
  });

  it("changes the password after checking the confirmation and the current one", async () => {
    const { repository } = await setupApi();
    open("/perfil");
    const panel = await screen.findByRole("region", { name: "Senha" });
    const submit = within(panel).getByRole("button", { name: "Alterar senha" });

    change("Senha atual", "Admin@123", panel);
    change("Nova senha", "Nova@123", panel);
    change("Confirmar nova senha", "Outra@123", panel);
    fireEvent.click(submit);
    expect(
      await within(panel).findByText(
        "A confirmação não confere com a nova senha.",
      ),
    ).toBeInTheDocument();

    change("Senha atual", "Errada@1", panel);
    change("Confirmar nova senha", "Nova@123", panel);
    fireEvent.click(submit);
    expect(
      await within(panel).findByText("A senha atual não confere."),
    ).toBeInTheDocument();

    change("Senha atual", "Admin@123", panel);
    fireEvent.click(submit);
    await within(panel).findByText(/Senha alterada/);
    expect(within(panel).getByLabelText("Senha atual")).toHaveValue("");
    // A sessão desta aba continua válida com o token renovado.
    await waitFor(async () =>
      expect(
        (await repository.findUserById(clinicId, actorId))?.sessionVersion,
      ).toBe(1),
    );
    expect(screen.getByRole("heading", { name: "Meu perfil" })).toBeVisible();
  });
});
