import { ActionModal } from "../../shared/components/ActionModal";
import type { AdminUser } from "@crm/contracts";
import { Plus, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { roleLabels } from "../../shared/lib/formatting";
import { countLabel } from "../patients/index";
import {
  lacksWhatsapp,
  userAccessSummary,
  userCommissionSummary,
} from "./model";
import { ResetPasswordModal } from "./ResetPasswordModal";
import { UserActiveModal } from "./UserActiveModal";
import { UserFormModal } from "./UserFormModal";

export function AdminUsersContent() {
  const [revoking, setRevoking] = useState<AdminUser | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [userForm, setUserForm] = useState<AdminUser | "new" | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [toggling, setToggling] = useState<AdminUser | null>(null);
  useEffect(() => {
    let active = true;
    api
      .adminUsers()
      .then((data) => {
        if (active) setUsers(data);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  function finish(message: string) {
    setUserForm(null);
    setResetting(null);
    setToggling(null);
    setError("");
    setNotice(message);
    setAttempt((value) => value + 1);
  }
  return (
    <>
      <div className="settings-toolbar">
        <p className="muted-copy">
          {users
            ? countLabel(users.length, "usuário", "usuários") + " na equipe"
            : "Acessos da equipe"}
        </p>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            setNotice("");
            setUserForm("new");
          }}
        >
          <Plus size={17} /> Novo usuário
        </button>
      </div>
      {error && (
        <>
          <ErrorBanner error={error} />
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </>
      )}
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      <div className="admin-users">
        {users === null ? (
          !error && <LoadingBlock />
        ) : users.length === 0 ? (
          <EmptyState
            title="Nenhum usuário"
            copy="Cadastre a equipe em “Novo usuário”."
          />
        ) : (
          users.map((item) => (
            <article key={item.id} className="admin-user-row">
              <div className="admin-user-info">
                <span className="settings-user-avatar" aria-hidden="true">
                  <UserRound size={20} />
                </span>
                <div className="settings-user-details">
                  <strong>{item.fullName}</strong>
                  <small>
                    {roleLabels[item.role]}
                    {item.jobTitle ? ` · ${item.jobTitle}` : ""}
                  </small>
                  <small className="admin-user-email">{item.email}</small>
                  <small>{userAccessSummary(item)}</small>
                  <small>{userCommissionSummary(item)}</small>
                  {(!item.active || lacksWhatsapp(item)) && (
                    <div className="admin-user-tags">
                      {!item.active && (
                        <span className="status-pill cancelled">Inativo</span>
                      )}
                      {lacksWhatsapp(item) && (
                        <span
                          className="status-pill paused"
                          title="Profissional da agenda sem WhatsApp: o “Compartilhar agenda” pede o número a cada envio."
                        >
                          Sem WhatsApp
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="admin-user-actions">
                <button
                  className="secondary-button button-sm"
                  onClick={() => setRevoking(item)}
                >
                  Encerrar acessos
                </button>
                <button
                  className="secondary-button button-sm"
                  aria-label={`Editar ${item.fullName}`}
                  onClick={() => {
                    setNotice("");
                    setUserForm(item);
                  }}
                >
                  Editar
                </button>
                <button
                  className={
                    item.active
                      ? "danger-button button-sm"
                      : "secondary-button button-sm"
                  }
                  onClick={() => {
                    setNotice("");
                    setToggling(item);
                  }}
                >
                  {item.active ? "Desativar" : "Ativar"}
                </button>
                <button
                  className="secondary-button button-sm"
                  onClick={() => {
                    setNotice("");
                    setResetting(item);
                  }}
                >
                  Redefinir senha
                </button>
              </div>
            </article>
          ))
        )}
      </div>
      {userForm && (
        <UserFormModal
          user={userForm === "new" ? null : userForm}
          users={users ?? []}
          onClose={() => setUserForm(null)}
          onSaved={(saved) =>
            finish(
              userForm === "new"
                ? `Usuário ${saved.fullName} criado.`
                : `Alterações de ${saved.fullName} salvas.`,
            )
          }
        />
      )}
      {revoking && (
        <ActionModal
          eyebrow="Acesso"
          title="Encerrar todos os acessos"
          subtitle={revoking.fullName}
          effect="Os acessos atuais deste usuário serão invalidados. Ele poderá entrar novamente com sua senha."
          confirmLabel="Encerrar acessos"
          onClose={() => setRevoking(null)}
          onConfirm={async () => {
            await api.revokeAdminUserSessions(revoking.id);
            setNotice(`Acessos de ${revoking.fullName} encerrados.`);
            setRevoking(null);
          }}
        />
      )}
      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={() => finish(`Senha de ${resetting.fullName} redefinida.`)}
        />
      )}
      {toggling && (
        <UserActiveModal
          user={toggling}
          onClose={() => setToggling(null)}
          onDone={(updated) =>
            finish(
              updated.active
                ? `${updated.fullName} voltou a ter acesso.`
                : `${updated.fullName} foi desativado(a).`,
            )
          }
        />
      )}
    </>
  );
}
