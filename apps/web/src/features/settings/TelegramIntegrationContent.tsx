import {
  normalizeTelegramTopics,
  TELEGRAM_LINK_CODE_TTL_MINUTES,
  TELEGRAM_LINK_COMMAND,
  telegramTopicLabels,
  telegramTopics,
  type TelegramGroupLink,
  type TelegramLinkCode,
  type TelegramStatus,
  type TelegramTopic,
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

/** "Recibos, Agendamentos e Clientes novos". */
function topicList(topics: readonly TelegramTopic[]) {
  const labels = topics.map((topic) => telegramTopicLabels[topic]);
  return labels.length <= 1
    ? (labels[0] ?? "")
    : `${labels.slice(0, -1).join(", ")} e ${labels.at(-1)}`;
}

const sameTopics = (a: readonly TelegramTopic[], b: readonly TelegramTopic[]) =>
  a.join() === b.join();

/** Resultado de "Já enviei" quando o vínculo ainda não aconteceu (INT2). */
type LinkCheck = "pending" | "expired" | null;

const isExpired = (code: TelegramLinkCode) =>
  new Date(code.expiresAt).getTime() <= Date.now();

/** Aviso de "Já enviei" sem vínculo: o que conferir, ou que o código venceu. */
function LinkCheckWarning({
  check,
  code,
  chat,
}: {
  check: Exclude<LinkCheck, null>;
  code: TelegramLinkCode;
  chat: "chat" | "group";
}) {
  return (
    <div className="form-error" role="alert">
      {check === "expired"
        ? `Este código venceu às ${timeLabel.format(new Date(code.expiresAt))} e não vale mais. Gere outro código e envie a nova mensagem.`
        : chat === "chat"
          ? "O CRM ainda não recebeu a mensagem com este código. Confira se você enviou a mensagem acima, sem alterar, no chat privado com o bot do estúdio e dentro do prazo do código. Depois clique em Já enviei de novo."
          : "O CRM ainda não recebeu a mensagem com este código. Confira se o bot do estúdio está no grupo e se a mensagem acima foi enviada nesse grupo, sem alterar, dentro do prazo do código. Depois clique em Já enviei de novo."}
    </div>
  );
}

/** No grupo, o comando com o nome do bot: `/vincular@nome_do_bot CÓDIGO` (INT3). */
function groupCommand(code: TelegramLinkCode, botUsername?: string) {
  return botUsername && code.command.startsWith(`${TELEGRAM_LINK_COMMAND} `)
    ? `${TELEGRAM_LINK_COMMAND}@${botUsername}${code.command.slice(TELEGRAM_LINK_COMMAND.length)}`
    : code.command;
}

/** Link do bot no Telegram, em nova aba (INT3). */
function BotLink({ username }: { username: string }) {
  return (
    <a
      href={`https://t.me/${username}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      @{username}
    </a>
  );
}

/**
 * Mensagem pronta para o Telegram com botão de copiar (INT3), como o token das chaves de API:
 * sem área de transferência, pede para selecionar e copiar à mão.
 */
function CopyMessageField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  async function copy() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError("Selecione a mensagem e copie manualmente.");
    }
  }

  return (
    <>
      <label>
        {label}
        <input
          readOnly
          value={value}
          onFocus={(event) => event.target.select()}
        />
      </label>
      {copyError && (
        <div className="form-error" role="alert">
          {copyError}
        </div>
      )}
      <div className="modal-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => void copy()}
        >
          {copied ? "Copiado" : "Copiar mensagem"}
        </button>
      </div>
    </>
  );
}

/** Caixas dos assuntos dos avisos (TG7). */
function TopicChecks({
  legend,
  value,
  onChange,
  disabled = false,
  className = "",
}: {
  legend: string;
  value: TelegramTopic[];
  onChange: (topics: TelegramTopic[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <fieldset className={`telegram-topics ${className}`.trim()}>
      <legend>{legend}</legend>
      {telegramTopics.map((topic) => (
        <label key={topic} className="checkbox-field">
          <input
            type="checkbox"
            checked={value.includes(topic)}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? normalizeTelegramTopics([...value, topic])
                  : value.filter((item) => item !== topic),
              )
            }
          />
          {telegramTopicLabels[topic]}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Grupos do Telegram (TG7): o admin gera um código com os assuntos do grupo, envia no grupo e
 * o grupo passa a receber só esses avisos.
 */
function TelegramGroupsContent({ botUsername }: { botUsername?: string }) {
  const [groups, setGroups] = useState<TelegramGroupLink[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState<TelegramLinkCode | null>(null);
  /** Assuntos do código atual, para gerar outro igual quando ele vencer. */
  const [codeTopics, setCodeTopics] = useState<TelegramTopic[]>([]);
  const [linkCheck, setLinkCheck] = useState<LinkCheck>(null);
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState<TelegramGroupLink | null>(null);
  const [removing, setRemoving] = useState<TelegramGroupLink | null>(null);
  const [draft, setDraft] = useState<TelegramTopic[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    api
      .telegramGroups()
      .then((data) => active && setGroups(data))
      .catch((cause: Error) => active && setError(cause.message));
    return () => {
      active = false;
    };
  }, [attempt]);

  function reload() {
    setGroups(null);
    setError("");
    setAttempt((value) => value + 1);
  }

  /** "Já enviei": recarrega os grupos e só some com o código se um grupo foi vinculado ou revinculado. */
  async function confirmSent() {
    if (!code || !groups || checking) return;
    // Revincular um grupo já vinculado mantém o id e só atualiza a data, o nome e os assuntos.
    const linkKey = (group: TelegramGroupLink) =>
      `${group.linkedAt}|${group.title ?? ""}|${group.topics.join()}`;
    const before = new Map(groups.map((group) => [group.id, linkKey(group)]));
    setChecking(true);
    setLinkCheck(null);
    setNotice("");
    try {
      const data = await api.telegramGroups();
      setGroups(data);
      if (data.some((group) => before.get(group.id) !== linkKey(group)))
        setCode(null);
      else setLinkCheck(isExpired(code) ? "expired" : "pending");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setChecking(false);
    }
  }

  const missing = draft.length ? [] : ["pelo menos um tipo de aviso"];

  return (
    <div className="telegram-groups">
      <div className="telegram-groups-head">
        <div>
          <h4>Grupos</h4>
          <p className="muted-copy">
            Cada grupo recebe só os avisos marcados. Os comandos de agenda só
            respondem no chat privado com o bot.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setNotice("");
            setDraft([...telegramTopics]);
            setCreating(true);
          }}
        >
          <Send size={17} aria-hidden="true" />
          Vincular grupo
        </button>
      </div>
      {notice && (
        <div className="success-banner" role="status">
          {notice}
        </div>
      )}
      {code && linkCheck === "expired" ? (
        <div className="clinical-form">
          <LinkCheckWarning check="expired" code={code} chat="group" />
          <div className="modal-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setDraft(codeTopics);
                setCreating(true);
              }}
            >
              Gerar outro código
            </button>
          </div>
        </div>
      ) : code ? (
        <div className="clinical-form" role="status">
          <p className="muted-copy">
            {botUsername ? (
              <>
                Adicione o bot do estúdio (<BotLink username={botUsername} />)
                ao grupo e envie lá a mensagem abaixo.
              </>
            ) : (
              <>
                Adicione o bot do estúdio ao grupo e envie lá a mensagem abaixo.
                Se o Telegram pedir, acrescente o nome do bot ao comando
                (/vincular@nome_do_bot).
              </>
            )}{" "}
            O código vale {TELEGRAM_LINK_CODE_TTL_MINUTES} minutos (até{" "}
            {timeLabel.format(new Date(code.expiresAt))}) e só pode ser usado
            uma vez.
          </p>
          <CopyMessageField
            key={code.code}
            label="Mensagem para o grupo"
            value={groupCommand(code, botUsername)}
          />
          {linkCheck && (
            <LinkCheckWarning check={linkCheck} code={code} chat="group" />
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="primary-button"
              disabled={!groups || checking}
              onClick={() => void confirmSent()}
            >
              {checking ? "Conferindo…" : "Já enviei"}
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <>
          <ErrorBanner error={error} />
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={reload}>
              Tentar novamente
            </button>
          </div>
        </>
      ) : !groups ? (
        <LoadingBlock />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={Send}
          title="Nenhum grupo vinculado"
          copy="Vincule um grupo para separar os avisos, por exemplo recibos num grupo e agendamentos em outro."
        />
      ) : (
        <div className="holiday-list">
          {groups.map((group) => (
            <article key={group.id}>
              <div>
                <strong>{group.title || "Grupo sem nome"}</strong>
                <small>
                  {topicList(group.topics)} · vinculado em{" "}
                  {shortDate.format(new Date(group.linkedAt))}
                  {group.linkedByName ? ` por ${group.linkedByName}` : ""}
                </small>
              </div>
              <div className="telegram-row-actions">
                <button
                  type="button"
                  className="secondary-button button-sm"
                  aria-label={`Editar avisos de ${group.title || "grupo sem nome"}`}
                  onClick={() => {
                    setNotice("");
                    setDraft(group.topics);
                    setEditing(group);
                  }}
                >
                  Editar avisos
                </button>
                <button
                  type="button"
                  className="danger-button button-sm"
                  aria-label={`Desvincular ${group.title || "grupo sem nome"}`}
                  onClick={() => {
                    setNotice("");
                    setRemoving(group);
                  }}
                >
                  Desvincular
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {creating && (
        <ActionModal
          eyebrow="Integrações"
          title="Vincular grupo do Telegram"
          subtitle="Escolha os avisos que o grupo vai receber"
          confirmLabel="Gerar código"
          missing={missing}
          dirty={!sameTopics(draft, [...telegramTopics])}
          onConfirm={async () => {
            setCode(await api.createTelegramGroupLinkCode(draft));
            setCodeTopics(draft);
            setLinkCheck(null);
            setCreating(false);
          }}
          onClose={() => setCreating(false)}
        >
          <TopicChecks
            legend="Avisos do grupo"
            value={draft}
            onChange={setDraft}
            className="span-2"
          />
        </ActionModal>
      )}
      {editing && (
        <ActionModal
          eyebrow="Integrações"
          title="Editar avisos do grupo"
          subtitle={editing.title || "Grupo sem nome"}
          confirmLabel="Salvar"
          missing={missing}
          dirty={!sameTopics(draft, editing.topics)}
          onConfirm={async () => {
            const saved = await api.updateTelegramGroup(editing.id, draft);
            setGroups((current) =>
              (current ?? []).map((item) =>
                item.id === saved.id ? saved : item,
              ),
            );
            setEditing(null);
            setNotice("Avisos do grupo atualizados.");
          }}
          onClose={() => setEditing(null)}
        >
          <TopicChecks
            legend="Avisos do grupo"
            value={draft}
            onChange={setDraft}
            className="span-2"
          />
        </ActionModal>
      )}
      {removing && (
        <ActionModal
          eyebrow="Integrações"
          title="Desvincular grupo"
          subtitle={removing.title || "Grupo sem nome"}
          effect="Os avisos do CRM param de chegar neste grupo. Para voltar a receber, gere um novo código."
          confirmLabel="Desvincular"
          danger
          onConfirm={async () => {
            await api.deleteTelegramGroup(removing.id);
            setGroups((current) =>
              (current ?? []).filter((item) => item.id !== removing.id),
            );
            setRemoving(null);
            setNotice("Grupo desvinculado.");
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

/**
 * Telegram (TG1): o usuário vincula o próprio chat ao bot com um código de uso único e passa a
 * receber os avisos do CRM. Sem o token do bot no servidor, a integração fica desligada.
 */
export function TelegramIntegrationContent() {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState<TelegramLinkCode | null>(null);
  const [linkCheck, setLinkCheck] = useState<LinkCheck>(null);
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [notice, setNotice] = useState("");
  /** Edição dos assuntos do chat pessoal; `null` = o que está gravado. */
  const [topicsDraft, setTopicsDraft] = useState<TelegramTopic[] | null>(null);
  const [savingTopics, setSavingTopics] = useState(false);
  const savingRef = useRef(false);
  useSettingsBusy(saving || savingTopics);

  const topics = topicsDraft ?? status?.link?.topics ?? [];

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
      setLinkCheck(null);
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function saveTopics() {
    setSavingTopics(true);
    setActionError("");
    setNotice("");
    try {
      setStatus(await api.saveTelegramLinkTopics(topics));
      setTopicsDraft(null);
      setNotice("Avisos deste chat atualizados.");
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setSavingTopics(false);
    }
  }

  async function unlink() {
    const next = await api.unlinkTelegram();
    setStatus(next);
    setTopicsDraft(null);
    setCode(null);
    setUnlinking(false);
    setNotice("Telegram desvinculado. Os avisos não chegam mais neste chat.");
  }

  /** "Já enviei": recarrega o estado e só some com o código se o chat foi vinculado. */
  async function confirmSent() {
    if (!code || checking) return;
    setChecking(true);
    setLinkCheck(null);
    setActionError("");
    setNotice("");
    try {
      const data = await api.telegramStatus();
      setStatus(data);
      if (data.link) {
        setTopicsDraft(null);
        setCode(null);
      } else setLinkCheck(isExpired(code) ? "expired" : "pending");
    } catch (cause) {
      setActionError((cause as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <section
      className="catalog-section telegram-section"
      aria-labelledby="telegram-title"
    >
      <header className="catalog-section-head">
        <div>
          <h3 id="telegram-title">Telegram</h3>
          <p>Receba os avisos do CRM num chat com o bot do estúdio.</p>
        </div>
        {status?.enabled && (
          <span
            className={
              "status-pill " + (status.link ? "confirmed" : "scheduled")
            }
          >
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
            <>
              <div className="holiday-list">
                <article>
                  <div>
                    <strong>Chat vinculado</strong>
                    <small>
                      Vinculado em{" "}
                      {shortDate.format(new Date(status.link.linkedAt))}
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
              <TopicChecks
                legend="Avisos neste chat"
                value={topics}
                onChange={setTopicsDraft}
                disabled={savingTopics}
              />
              <p className="muted-copy">
                Sem nenhum marcado, o chat fica só com os comandos /hoje,
                /semana e /mes.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    savingTopics || sameTopics(topics, status.link.topics)
                  }
                  onClick={() => void saveTopics()}
                >
                  {savingTopics ? "Salvando…" : "Salvar avisos"}
                </button>
              </div>
            </>
          ) : !status.canLink ? (
            <p className="muted-copy">
              Seu perfil não pode vincular o Telegram. Fale com o admin da
              clínica.
            </p>
          ) : code && linkCheck === "expired" ? (
            <div className="clinical-form">
              <LinkCheckWarning check="expired" code={code} chat="chat" />
              <div className="modal-actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={saving}
                  onClick={() => void generate()}
                >
                  {saving ? "Gerando…" : "Gerar outro código"}
                </button>
              </div>
            </div>
          ) : code ? (
            <div className="clinical-form" role="status">
              <p className="muted-copy">
                {status.botUsername ? (
                  <>
                    Abra o chat com o bot do estúdio,{" "}
                    <BotLink username={status.botUsername} />, no Telegram e
                    envie a mensagem abaixo.
                  </>
                ) : (
                  "Abra o chat com o bot do estúdio no Telegram e envie a mensagem abaixo."
                )}{" "}
                O código vale {TELEGRAM_LINK_CODE_TTL_MINUTES} minutos (até{" "}
                {timeLabel.format(new Date(code.expiresAt))}) e só pode ser
                usado uma vez.
              </p>
              <CopyMessageField
                key={code.code}
                label="Mensagem para o bot"
                value={code.command}
              />
              {linkCheck && (
                <LinkCheckWarning check={linkCheck} code={code} chat="chat" />
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={saving || checking}
                  onClick={() => void generate()}
                >
                  Gerar outro código
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={saving || checking}
                  onClick={() => void confirmSent()}
                >
                  {checking ? "Conferindo…" : "Já enviei"}
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
          <TelegramGroupsContent
            {...(status.botUsername ? { botUsername: status.botUsername } : {})}
          />
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
