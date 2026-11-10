import {
  whatsappLink,
  type Appointment,
  type GroupSession,
  type Professional,
} from "@crm/contracts";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { useAuthorization } from "../../authorization-context";
import { LoadingBlock } from "../../shared/components/LoadingBlock";
import { useMissingFields } from "../../shared/components/MissingFields";
import { Modal, ModalCancelButton } from "../../shared/components/Modal";
import { PhoneInput } from "../../shared/components/PhoneInput";
import {
  agendaShareDays,
  agendaShareMaxDays,
  agendaShareMessage,
  agendaShareWhatsappHint,
} from "./model";

/**
 * "Compartilhar agenda": escolhe profissional e período e abre o WhatsApp com a agenda dele.
 * O número vem do cadastro do usuário ligado ao profissional e pode ser trocado aqui.
 */
export function ShareAgendaModal({
  professionals,
  initialProfessionalId,
  initialFrom,
  initialTo,
  onClose,
}: {
  professionals: Professional[];
  initialProfessionalId: string;
  initialFrom: string;
  initialTo: string;
  onClose: () => void;
}) {
  const [professionalId, setProfessionalId] = useState(
    professionals.some((item) => item.id === initialProfessionalId)
      ? initialProfessionalId
      : (professionals[0]?.id ?? ""),
  );
  const professional = professionals.find((item) => item.id === professionalId);
  const { user } = useAuthorization();
  // A aba "Usuários" das Configurações é só do administrador.
  const canManageUsers = user?.role === "admin";
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [phone, setPhone] = useState(professional?.whatsapp ?? "");
  // Resultado da última busca, marcado com o período: outro período = carregando.
  const [result, setResult] = useState<{
    period: string;
    appointments: Appointment[];
    groupSessions: GroupSession[];
    error: string;
  } | null>(null);

  const days = from && to ? agendaShareDays(from, to) : 0;
  const periodError =
    !from || !to
      ? "Informe o início e o fim do período."
      : days < 1
        ? "A data final precisa ser igual ou posterior à inicial."
        : days > agendaShareMaxDays
          ? `Escolha um período de até ${agendaShareMaxDays} dias.`
          : "";
  const period = `${from}|${to}`;
  const loading = !periodError && result?.period !== period;
  const data = !loading && result && !result.error ? result : null;
  const loadError = !loading && result ? result.error : "";

  useEffect(() => {
    if (periodError) return;
    let active = true;
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
    Promise.all([
      api.appointments(start.toISOString(), end.toISOString()),
      api.groupSessions(start.toISOString(), end.toISOString()),
    ])
      .then(([appointments, groupSessions]) => {
        if (active)
          setResult({ period, appointments, groupSessions, error: "" });
      })
      .catch((cause: Error) => {
        if (active)
          setResult({
            period,
            appointments: [],
            groupSessions: [],
            error: cause.message,
          });
      });
    return () => {
      active = false;
    };
  }, [from, to, period, periodError]);

  function chooseProfessional(id: string) {
    setProfessionalId(id);
    setPhone(professionals.find((item) => item.id === id)?.whatsapp ?? "");
  }

  const message =
    professional && data && !periodError
      ? agendaShareMessage({
          professional,
          from,
          to,
          appointments: data.appointments,
          groupSessions: data.groupSessions,
        })
      : "";
  const phoneComplete = phone.length >= 10;
  const missing = useMissingFields([
    ...(!professional ? ["Profissional"] : []),
    ...(!phoneComplete ? ["WhatsApp com DDD"] : []),
  ]);

  return (
    <Modal
      title="Compartilhar agenda"
      subtitle="Envie a agenda de um profissional pelo WhatsApp."
      eyebrow="Agenda"
      onClose={onClose}
    >
      <div className="form-grid">
        <label className="span-2">
          Profissional
          <select
            value={professionalId}
            onChange={(event) => chooseProfessional(event.target.value)}
          >
            {professionals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.fullName}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <div className="field-with-hint span-2">
          <label>
            WhatsApp do profissional
            <PhoneInput value={phone} onChange={setPhone} />
          </label>
          <small className="field-hint">
            {agendaShareWhatsappHint({
              hasWhatsapp: Boolean(professional?.whatsapp),
              canManageUsers,
            })}
            {!professional?.whatsapp && canManageUsers && (
              <>
                {" "}
                <Link className="text-link" to="/configuracoes?secao=usuarios">
                  Abrir usuários em Configurações
                </Link>
              </>
            )}
          </small>
        </div>
        {periodError && <div className="form-error span-2">{periodError}</div>}
        {loadError && <div className="form-error span-2">{loadError}</div>}
        {!periodError && !loadError && (
          <section className="template-preview span-2" aria-live="polite">
            <h3>Mensagem</h3>
            {loading ? (
              <LoadingBlock />
            ) : (
              <p className="agenda-share-message">{message}</p>
            )}
          </section>
        )}
        {missing.hint}
        <div className="modal-actions span-2">
          <ModalCancelButton>Voltar</ModalCancelButton>
          {!missing.blocked && message && !loading ? (
            <a
              className="whatsapp-button"
              href={whatsappLink(phone, message)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} aria-hidden="true" />
              Enviar pelo WhatsApp
            </a>
          ) : (
            <button
              type="button"
              className="whatsapp-button"
              disabled
              aria-describedby={missing.describedBy}
            >
              <MessageCircle size={16} aria-hidden="true" />
              Enviar pelo WhatsApp
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
