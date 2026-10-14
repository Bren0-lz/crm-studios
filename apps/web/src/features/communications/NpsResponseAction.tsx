import type { OutboundMessage } from "@crm/contracts";
import { useState } from "react";
import { useAuthorization } from "../../authorization-context";
import { SatisfactionSurveyModal } from "../agenda/index";
export function NpsResponseAction({
  message,
  onChanged,
}: {
  message: OutboundMessage;
  onChanged: () => Promise<void>;
}) {
  const { can } = useAuthorization(),
    [open, setOpen] = useState(false),
    [recorded, setRecorded] = useState(false),
    [error, setError] = useState("");
  if (message.kind !== "satisfaction_followup") return null;
  if (message.satisfactionSurveyId || recorded)
    return <small>Resposta de NPS registrada pela equipe.</small>;
  if (!can("agenda.satisfaction_create")) return null;
  const saved = () => {
    setRecorded(true);
    setOpen(false);
    onChanged().catch((cause: Error) => setError(cause.message));
  };
  return (
    <>
      <button className="secondary-button" onClick={() => setOpen(true)}>
        Registrar resposta de NPS
      </button>
      {error && <p role="alert">{error}</p>}
      {open && (
        <SatisfactionSurveyModal
          patient={{ id: message.patientId, fullName: message.patientName }}
          sourceMessageId={message.id}
          onClose={() => setOpen(false)}
          onSaved={saved}
          onDuplicate={saved}
        />
      )}
    </>
  );
}
