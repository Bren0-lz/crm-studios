import {
  TELEGRAM_LINK_CODE_TTL_MINUTES,
  type TelegramLinkCode,
  type TelegramStatus,
  userRoleLabels,
} from "@crm/contracts";
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { ActionModal } from "../../shared/components/ActionModal";
import { EmptyState } from "../../shared/components/EmptyState";
import { ErrorBanner } from "../../shared/components/ErrorBanner";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { shortDate, timeLabel } from "../../shared/lib/formatting";
import { useSettingsBusy } from "../../shared/workflows/useSettingsBusy";

/**
 * Telegram (TG1): o usuário vincula o próprio chat ao bot com um código de uso único e passa a
 * receber os avisos do CRM. Sem o token do bot no servidor, a integração fica desligada.
 */
export function TelegramIntegrationContent() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState<TelegramLinkCode | null>(null);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [notice, setNotice] = useState("");
  const savingRef = useRef(false);
  useSettingsBusy(saving);

  useEffect(() => {
    let active = true;
    api
      .telegramStatus()
      .then((data) => active && setStatus(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [attempt]);

  async function generate() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setActionError("");
    setNotice("");
    try {
      setCode(await api.createTelegramLinkCode());
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function unlink() {
    const next = await api.unlinkTelegram();
    setStatus(next);
    setCode(null);
    setUnlinking(false);
    setNotice("Telegram desvinculado. Os avisos não chegam mais neste chat.");
  }

  function refresh() {
    setStatus(null);
    setCode(null);
    setNotice("");
    setAttempt((value) => value + 1);
  }

  return (
    <section className="catalog-section telegram-section" aria-labelledby="telegram-title">
      <header className="catalog-section-head">
        <div>
          <h3 id="telegram-title">Telegram</h3>
          <p>Receba os avisos do CRM num chat com o bot do estúdio.</p>
        </div>
        {status?.enabled && (
          <span className={"status-pill " + (status.link ? "confirmed" : "scheduled")}>
            {status.link ? "Vinculado" : "Não vinculado"}
          </span>
        )}
      </header>
      {error && (
        <>
          <ErrorBanner error={error} />
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              Tentar novamente
            </button>
          </div>
        </>
      )}
      {!status ? (
        !error && <LoadingBlock />
      ) : !status.enabled ? (
        <EmptyState
          icon={Send}
          title="Integração desligada"
          copy="O token do bot do Telegram ainda não foi configurado no servidor. Sem ele, nenhum aviso é enviado."
        />
      ) : (
        <>
          <p className="muted-copy">
            Podem vincular:{" "}
            {status.linkRoles.length
              ? status.linkRoles.map((role) => userRoleLabels[role]).join(", ")
              : "ninguém"}
            .
          </p>
          {notice && (
            <div className="success-banner" role="status">
              {notice}
            </div>
          )}
          {status.link ? (
            <div className="holiday-list">
              <article>
                <div>
                  <strong>Chat vinculado</strong>
                  <small>
                    Vinculado em {shortDate.format(new Date(status.link.linkedAt))}
                  </small>
                </div>
                <button
                  type="button"
                  className="danger-button button-sm"
                  onClick={() => setUnlinking(true)}
                >
                  Desvincular
                </button>
              </article>
            </div>
          ) : !status.canLink ? (
            <p className="muted-copy">
              Seu perfil não pode vincular o Telegram. Fale com o admin da
              clínica.
            </p>
          ) : code ? (
            <div className="clinical-form" role="status">
              <p className="muted-copy">
                Abra o chat com o bot do estúdio no Telegram e envie a mensagem
                abaixo. O código vale {TELEGRAM_LINK_CODE_TTL_MINUTES} minutos
                (até {timeLabel.format(new Date(code.expiresAt))}) e só pode ser
                usado uma vez.
              </p>
              <label>
                Mensagem para o bot
                <input
                  readOnly
                  value={code.command}
                  onFocus={(event) => event.target.select()}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving}
                  onClick={() => void generate()}
                >
                  Gerar outro código
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={refresh}
                >
                  Já enviei
                </button>
              </div>
            </div>
          ) : (
            <div className="modal-actions">
              <button
                type="button"
                className="primary-button"
                disabled={saving}
                onClick={() => void generate()}
              >
                <Send size={17} aria-hidden="true" />
                {saving ? "Gerando…" : "Gerar código de vínculo"}
              </button>
            </div>
          )}
          {actionError && (
            <div className="form-error" role="alert">
              {actionError}
            </div>
          )}
        </>
      )}
      {unlinking && (
        <ActionModal
          eyebrow="Integrações"
          title="Desvincular Telegram"
          subtitle="Chat vinculado"
          effect="Os avisos do CRM param de chegar neste chat. Para voltar a receber, gere um novo código."
          confirmLabel="Desvincular"
          danger
          onConfirm={() => unlink()}
          onClose={() => setUnlinking(false)}
        />
      )}
    </section>
  );
}
