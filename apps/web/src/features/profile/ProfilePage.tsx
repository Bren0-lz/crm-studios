import { passwordSchema, type OwnProfile } from "@crm/contracts";
import { KeyRound, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { PageHeader } from "../../shared/components/PageHeader";
import { initials } from "../../shared/lib/formatting";

interface ProfileDraft {
  fullName: string;
  avatarDataUrl: string;
  agendaName: string;
  agendaColor: string;
}

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
/** Lado máximo da foto gravada: o cabeçalho e a página mostram no máximo 96px. */
const PHOTO_SIDE = 320;

function draftOf(profile: OwnProfile): ProfileDraft {
  return {
    fullName: profile.fullName,
    avatarDataUrl: profile.avatarDataUrl,
    agendaName: profile.professional?.fullName ?? "",
    agendaColor: profile.professional?.color ?? "",
  };
}

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a foto."));
    reader.readAsDataURL(file);
  });
}

/** Reduz a foto para no máximo 320px (JPEG); sem suporte no navegador, grava a original. */
async function photoDataUrl(file: File) {
  if (typeof createImageBitmap !== "function") return readAsDataUrl(file);
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      PHOTO_SIDE / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return readAsDataUrl(file);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } catch {
    return readAsDataUrl(file);
  }
}

export function ProfilePage() {
  const { user, setUser } = useAuthorization();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .ownProfile()
      .then((data) => {
        if (!active) return;
        setProfile(data);
        setDraft(draftOf(data));
      })
      .catch((cause: Error) => {
        if (active) setLoadError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const dirty =
    profile !== null &&
    draft !== null &&
    JSON.stringify(draft) !== JSON.stringify(draftOf(profile));

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setError("");
    setNotice("");
    if (
      file.size > MAX_PHOTO_BYTES ||
      !["image/png", "image/jpeg"].includes(file.type)
    ) {
      setError("Use uma foto PNG ou JPEG de até 2 MB.");
      return;
    }
    try {
      const dataUrl = await photoDataUrl(file);
      setDraft((current) =>
        current ? { ...current, avatarDataUrl: dataUrl } : current,
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  async function save() {
    if (!draft || !profile || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await api.updateOwnProfile({
        fullName: draft.fullName,
        avatarDataUrl: draft.avatarDataUrl,
        ...(profile.professional
          ? { agendaName: draft.agendaName, agendaColor: draft.agendaColor }
          : {}),
      });
      setProfile(saved);
      setDraft(draftOf(saved));
      setNotice("Perfil salvo.");
      if (user) {
        const { avatarDataUrl: _previous, ...rest } = user;
        void _previous;
        setUser({
          ...rest,
          fullName: saved.fullName,
          ...(saved.avatarDataUrl
            ? { avatarDataUrl: saved.avatarDataUrl }
            : {}),
        });
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Meu perfil"
        description="Sua foto, seu nome, como você aparece na agenda e sua senha."
      />
      {loadError ? (
        <section className="panel profile-panel">
          <div className="profile-state">
            <ErrorBanner error={loadError} />
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setLoadError("");
                setAttempt((value) => value + 1);
              }}
            >
              Tentar novamente
            </button>
          </div>
        </section>
      ) : !profile || !draft ? (
        <section className="panel profile-panel">
          <div className="profile-state">
            <LoadingBlock />
          </div>
        </section>
      ) : (
        <div className="profile-layout">
          <section
            className="panel profile-panel"
            aria-labelledby="profile-data-title"
          >
            <div className="panel-head">
              <div>
                <h2 id="profile-data-title">Dados pessoais</h2>
              </div>
            </div>
            <form
              className="clinical-form profile-form"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <fieldset disabled={saving} className="profile-fieldset">
                <div className="profile-photo">
                  <div className="profile-photo-preview">
                    {draft.avatarDataUrl ? (
                      <img src={draft.avatarDataUrl} alt="Sua foto" />
                    ) : (
                      <span aria-hidden="true">
                        {initials(draft.fullName || profile.fullName)}
                      </span>
                    )}
                  </div>
                  <div className="profile-photo-controls">
                    <label htmlFor="profile-photo">Foto</label>
                    <input
                      id="profile-photo"
                      type="file"
                      accept="image/png,image/jpeg"
                      aria-describedby="profile-photo-help"
                      onChange={(event) => {
                        void choosePhoto(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                    <p id="profile-photo-help">PNG ou JPEG de até 2 MB.</p>
                    {draft.avatarDataUrl && (
                      <button
                        type="button"
                        className="text-button profile-photo-remove"
                        onClick={() => {
                          setDraft({ ...draft, avatarDataUrl: "" });
                          setNotice("");
                        }}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                        Remover foto
                      </button>
                    )}
                  </div>
                </div>
                <div className="form-grid">
                  <label className="span-2">
                    Nome completo
                    <input
                      required
                      minLength={3}
                      maxLength={160}
                      autoComplete="name"
                      value={draft.fullName}
                      onChange={(event) => {
                        setDraft({ ...draft, fullName: event.target.value });
                        setNotice("");
                      }}
                    />
                  </label>
                  <label>
                    E-mail de acesso
                    <input
                      value={profile.email}
                      readOnly
                      title="Só um administrador altera o e-mail."
                    />
                  </label>
                  <label>
                    Cargo
                    <input value={profile.jobTitle ?? "—"} readOnly />
                  </label>
                </div>
                <h3 className="profile-subtitle">Agenda</h3>
                {profile.professional ? (
                  <div className="form-grid">
                    <label>
                      Nome na agenda
                      <input
                        required
                        minLength={3}
                        maxLength={160}
                        value={draft.agendaName}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            agendaName: event.target.value,
                          });
                          setNotice("");
                        }}
                      />
                    </label>
                    <label>
                      Cor na agenda
                      <input
                        type="color"
                        className="profile-color"
                        value={draft.agendaColor}
                        onChange={(event) => {
                          setDraft({
                            ...draft,
                            agendaColor: event.target.value,
                          });
                          setNotice("");
                        }}
                      />
                    </label>
                    <p className="profile-hint span-2">
                      O nome e a cor aparecem nos seus atendimentos da agenda.
                    </p>
                  </div>
                ) : (
                  <p className="muted-copy">
                    Seu usuário não está ligado a um profissional da agenda. Um
                    administrador faz essa ligação em Configurações → Usuários.
                  </p>
                )}
              </fieldset>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <div className="success-banner" role="status">
                  {notice}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!dirty || saving}
                  onClick={() => {
                    setDraft(draftOf(profile));
                    setError("");
                    setNotice("");
                  }}
                >
                  Descartar alterações
                </button>
                <button className="primary-button" disabled={!dirty || saving}>
                  <Save size={16} aria-hidden="true" />
                  {saving ? "Salvando…" : "Salvar perfil"}
                </button>
              </div>
            </form>
          </section>
          <PasswordPanel />
        </div>
      )}
    </>
  );
}

function PasswordPanel() {
  const { setUser } = useAuthorization();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    setError("");
    setNotice("");
    const parsed = passwordSchema.safeParse(newPassword);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revise a nova senha.");
      return;
    }
    if (newPassword !== confirmation) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }
    setSaving(true);
    try {
      const session = await api.changeOwnPassword({
        currentPassword,
        newPassword,
      });
      setUser(session.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setNotice(
        "Senha alterada. As sessões em outros aparelhos foram encerradas.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="panel profile-panel"
      aria-labelledby="profile-password-title"
    >
      <div className="panel-head">
        <div>
          <h2 id="profile-password-title">Senha</h2>
        </div>
      </div>
      <form
        className="clinical-form profile-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={saving} className="profile-fieldset">
          <div className="form-grid">
            <label className="span-2">
              Senha atual
              <input
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label>
              Nova senha
              <input
                type="password"
                required
                maxLength={128}
                autoComplete="new-password"
                aria-describedby="profile-password-help"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label>
              Confirmar nova senha
              <input
                type="password"
                required
                maxLength={128}
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          </div>
          <p id="profile-password-help" className="profile-hint">
            Ao alterar, as sessões abertas em outros aparelhos são encerradas.
          </p>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <div className="success-banner" role="status">
            {notice}
          </div>
        )}
        <div className="modal-actions">
          <button className="primary-button" disabled={saving}>
            <KeyRound size={16} aria-hidden="true" />
            {saving ? "Alterando…" : "Alterar senha"}
          </button>
        </div>
      </form>
    </section>
  );
}
