import { patientTagDisplayColor } from "@crm/contracts";
import {
  broadcastSkipReasonLabels,
  type BroadcastInput,
  type BroadcastResult,
  type CommunicationChannel,
  type PatientOption,
  type PatientProfileFilter,
} from "@crm/contracts";
import { LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal } from "../../shared/components/Modal";
import { TagChoice } from "../../shared/components/TagChoice";
import { usePatientTags } from "../../shared/hooks/usePatientTags";
import { tagCounts } from "../../shared/lib/formatting";
import { broadcastChannelLabels } from "./model";

export function BroadcastPanel({
  patients,
  outboxOnly,
  onQueued,
}: {
  patients: PatientOption[];
  outboxOnly: boolean;
  onQueued: (result: BroadcastResult) => void;
}) {
  const { can } = useAuthorization();
  const [profile, setProfile] = useState<Omit<PatientProfileFilter, "segment">>(
    {},
  );
  const [tags, setTags] = useState<string[]>([]);
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [activePlan, setActivePlan] = useState<"" | "with" | "without">("");
  const [birthdayMonth, setBirthdayMonth] = useState(false);
  const [channel, setChannel] = useState<CommunicationChannel>("whatsapp");
  const [body, setBody] = useState("");
  const bodyMissing = useMissingFields(
    body.trim() ? [] : ["Texto do comunicado"],
  );
  const [preview, setPreview] = useState<BroadcastResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");

  // Segmento por etiqueta: as configuradas, com a cor e quantos clientes têm cada uma.
  const configuredTags = usePatientTags();
  const tagOptions = configuredTags.tags ?? [];
  const countTag = tagCounts(patients);

  const input: BroadcastInput = {
    segment: {
      ...profile,
      tags,
      ...(status ? { status } : {}),
      ...(activePlan ? { activePlan: activePlan === "with" } : {}),
      birthdayMonth,
    },
    channel,
    body: body.trim(),
  };

  function change(apply: () => void) {
    apply();
    setPreview(null);
    setError("");
  }

  async function requestPreview(event: FormEvent) {
    event.preventDefault();
    setPreview(null);
    // Sem texto, "Ver prévia" já vem desativado com "Falta: Texto do comunicado." (QM14).
    if (!input.body) return;
    setError("");
    setPreviewing(true);
    try {
      setPreview(await api.broadcastPreview(input));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  async function send() {
    setSending(true);
    setSendError("");
    try {
      const result = await api.sendBroadcast(input);
      setConfirming(false);
      setPreview(null);
      onQueued(result);
    } catch (cause) {
      setSendError((cause as Error).message);
    } finally {
      setSending(false);
    }
  }

  const outboxWarning = outboxOnly
    ? "As mensagens ficam na fila de trabalho da equipe. Realize o envio externamente e registre a conclusão manual."
    : "";

  return (
    <>
      <section className="panel communication-broadcast">
        <span className="eyebrow">Envio em massa</span>
        <h2>Comunicado segmentado</h2>
        {outboxWarning && (
          <div className="outbox-note">
            <LockKeyhole size={17} />
            <span>{outboxWarning}</span>
          </div>
        )}
        {can("communications.broadcast") && (
          <form
            className="form-grid"
            onSubmit={(event) => void requestPreview(event)}
            noValidate
          >
            {configuredTags.error ? (
              <p className="form-error span-2">{`Não foi possível carregar as etiquetas: ${configuredTags.error}`}</p>
            ) : (
              tagOptions.length > 0 && (
                <div className="span-2 broadcast-tags">
                  <span className="filter-label" id="broadcast-tag-filter">
                    Etiquetas (qualquer uma)
                  </span>
                  <div
                    className="tag-filter-list"
                    role="group"
                    aria-labelledby="broadcast-tag-filter"
                  >
                    {tagOptions.map((tag) => (
                      <TagChoice
                        key={tag.id}
                        name={tag.name}
                        color={patientTagDisplayColor(tag)}
                        count={countTag(tag.name)}
                        pressed={tags.includes(tag.name)}
                        onToggle={() =>
                          change(() =>
                            setTags((current) =>
                              current.includes(tag.name)
                                ? current.filter((item) => item !== tag.name)
                                : [...current, tag.name],
                            ),
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              )
            )}
            <label>
              Situação
              <select
                value={status}
                onChange={(event) =>
                  change(() => setStatus(event.target.value as typeof status))
                }
              >
                <option value="">Todos</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </label>
            <label>
              Plano
              <select
                value={activePlan}
                onChange={(event) =>
                  change(() =>
                    setActivePlan(event.target.value as typeof activePlan),
                  )
                }
              >
                <option value="">Todos</option>
                <option value="with">Com plano ativo</option>
                <option value="without">Sem plano ativo</option>
              </select>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={birthdayMonth}
                onChange={(event) =>
                  change(() => setBirthdayMonth(event.target.checked))
                }
              />
              Só aniversariantes do mês
            </label>
            <details className="span-2 filter-group">
              <summary>Dados cadastrais do segmento</summary>
              <div className="form-grid">
                {(
                  [
                    ["city", "Cidade"],
                    ["neighborhood", "Bairro"],
                    ["occupation", "Profissão"],
                    ["source", "Origem"],
                    ["level", "Nível"],
                    ["interest", "Interesse"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      maxLength={
                        key === "level" || key === "interest" ? 80 : 120
                      }
                      value={profile[key] ?? ""}
                      onChange={(event) =>
                        change(() =>
                          setProfile((current) => ({
                            ...current,
                            [key]: event.target.value || undefined,
                          })),
                        )
                      }
                    />
                  </label>
                ))}
                <label>
                  Gênero
                  <select
                    value={profile.gender ?? ""}
                    onChange={(event) =>
                      change(() =>
                        setProfile((current) => ({
                          ...current,
                          gender: event.target
                            .value as PatientProfileFilter["gender"],
                        })),
                      )
                    }
                  >
                    <option value="">Todos</option>
                    <option value="female">Feminino</option>
                    <option value="male">Masculino</option>
                    <option value="other">Outro</option>
                    <option value="undisclosed">Prefere não informar</option>
                  </select>
                </label>
                <label>
                  Tipo de cliente
                  <select
                    value={profile.clientType ?? ""}
                    onChange={(event) =>
                      change(() =>
                        setProfile((current) => ({
                          ...current,
                          clientType: event.target
                            .value as PatientProfileFilter["clientType"],
                        })),
                      )
                    }
                  >
                    <option value="">Todos</option>
                    <option value="fixed">Fixo</option>
                    <option value="rotating">Rotativo</option>
                  </select>
                </label>
              </div>
            </details>
            <label>
              Canal do comunicado
              <select
                value={channel}
                onChange={(event) =>
                  change(() =>
                    setChannel(event.target.value as CommunicationChannel),
                  )
                }
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="email">E-mail</option>
              </select>
            </label>
            <label className="span-2">
              Texto do comunicado
              <textarea
                maxLength={500}
                rows={4}
                value={body}
                onChange={(event) => {
                  const value = event.target.value;
                  change(() => setBody(value));
                }}
                placeholder="Use {{nome}} para o primeiro nome. Não inclua informações clínicas."
              />
            </label>
            {error && (
              <div className="form-error span-2" role="alert">
                {error}
              </div>
            )}
            {bodyMissing.hint}
            <div className="span-2 broadcast-actions">
              <button
                type="submit"
                className="secondary-button"
                disabled={previewing || bodyMissing.blocked}
                aria-describedby={bodyMissing.describedBy}
              >
                {previewing ? "Calculando…" : "Ver prévia"}
              </button>
              {preview &&
                preview.queued > 0 &&
                can("communications.broadcast") && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      setSendError("");
                      setConfirming(true);
                    }}
                  >
                    Enfileirar comunicado
                  </button>
                )}
            </div>
          </form>
        )}
        {preview && (
          <div className="broadcast-preview" aria-live="polite">
            <div className="broadcast-summary">
              <span className="status-pill">{`${preview.matched} cliente(s) no segmento`}</span>
              <span className="status-pill active">{`${preview.queued} entrará(ão) na fila`}</span>
              <span className="status-pill paused">{`${preview.skipped.length} pulado(s)`}</span>
            </div>
            {preview.queued === 0 && (
              <p>Nenhum cliente receberia este comunicado.</p>
            )}
            {preview.sampleBody && (
              <div className="broadcast-sample">
                <span className="filter-label">Exemplo de mensagem</span>
                <p>{preview.sampleBody}</p>
              </div>
            )}
            {preview.skipped.length > 0 && (
              <div className="broadcast-skipped">
                <span className="filter-label">Clientes pulados</span>
                <ul>
                  {preview.skipped.map((item) => (
                    <li key={item.patientId}>
                      <strong>{item.patientName}</strong>
                      <span>{broadcastSkipReasonLabels[item.reason]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
      {confirming && preview && (
        <Modal
          eyebrow="Comunicado"
          title="Confirmar comunicado"
          subtitle="Confira antes de adicionar as mensagens à fila."
          busy={sending}
          onClose={() => setConfirming(false)}
        >
          <div className="broadcast-confirm">
            <p>
              {`Serão adicionadas ${preview.queued} mensagem(ns) por ${broadcastChannelLabels[preview.channel]} à fila`}
              {preview.skipped.length > 0
                ? `; ${preview.skipped.length} cliente(s) ficarão de fora.`
                : "."}
            </p>
            {outboxWarning && (
              <div className="outbox-note">
                <LockKeyhole size={17} />
                <span>{outboxWarning}</span>
              </div>
            )}
            {sendError && (
              <div className="form-error" role="alert">
                {sendError}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirming(false)}
                disabled={sending}
              >
                Voltar
              </button>
              {can("communications.broadcast") && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void send()}
                  disabled={sending}
                >
                  {sending ? "Enfileirando…" : "Confirmar e enfileirar"}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
