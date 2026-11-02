import type { Appointment, PatientPlan } from "@crm/contracts";
import { whatsappLink } from "@crm/contracts";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api";
import { planScheduleMessage, sessionDateLabel } from "./session-schedule";

/**
 * Último passo da contratação com sessões agendadas: lista as sessões reservadas e abre o
 * WhatsApp do cliente com todas elas na mensagem.
 */
export function PlanSessionsSentStep({
  plan,
  appointments,
  onDone,
}: {
  plan: PatientPlan;
  appointments: Appointment[];
  onDone: () => void;
}) {
  const [phone, setPhone] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .patient(plan.patientId)
      .then((patient) => {
        if (alive)
          setPhone(patient.whatsapp?.trim() || patient.phone?.trim() || "");
      })
      .catch(() => {
        // Sem o telefone, o WhatsApp abre para escolher o contato.
        if (alive) setPhone("");
      });
    return () => {
      alive = false;
    };
  }, [plan.patientId]);
  const sorted = [...appointments].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
  const message = planScheduleMessage({
    patientName: plan.patientName,
    planName: plan.name,
    sessions: sorted.map((item) => ({
      startsAt: item.startsAt,
      serviceName: item.serviceName,
    })),
  });
  const href = phone
    ? whatsappLink(phone, message)
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  return (
    <div className="form-grid">
      <div className="success-banner span-2" role="status">
        {`${sorted.length} ${sorted.length === 1 ? "sessão agendada" : "sessões agendadas"} para ${plan.patientName}.`}
      </div>
      <ol className="plan-session-list span-2" aria-label="Sessões agendadas">
        {sorted.map((item, index) => (
          <li key={item.id} className="plan-session-row">
            <span className="plan-session-number">{index + 1}</span>
            <span className="plan-session-when">
              <strong>{sessionDateLabel(item.startsAt)}</strong>
              <small>
                {[item.serviceName, item.professionalName, item.roomName]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            </span>
          </li>
        ))}
      </ol>
      <div className="modal-actions span-2">
        <a
          className="whatsapp-button"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={phone === null}
        >
          <MessageCircle size={16} aria-hidden="true" />
          Enviar sessões pelo WhatsApp
        </a>
        <button type="button" className="primary-button" onClick={onDone}>
          Concluir
        </button>
      </div>
    </div>
  );
}
