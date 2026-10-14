import { useState } from "react";
import { api } from "../../api";
import { useAuthorization } from "../auth/authorization-context";
import { Modal } from "./Modal";
import { ErrorBanner } from "./ErrorBanner";
import { PatientPicker } from "../../PatientPicker";
import type { PatientOption } from "@crm/contracts";

export function EmergencyButton() {
  const { canView } = useAuthorization();
  const [open, setOpen] = useState(false),
    [patients, setPatients] = useState<PatientOption[]>([]),
    [patientId, setPatientId] = useState("");
  const [contact, setContact] = useState<{
      name: string;
      phone: string;
    } | null>(null),
    [error, setError] = useState("");
  if (
    !["patients", "agenda", "groups", "clinical"].some((module) =>
      canView(module as "patients" | "agenda" | "groups" | "clinical"),
    )
  )
    return null;
  function show() {
    setOpen(true);
    setError("");
    void api
      .patientOptions()
      .then(setPatients)
      .catch((cause: Error) => setError(cause.message));
  }
  function select(id: string) {
    setPatientId(id);
    setContact(null);
    setError("");
    if (id)
      void api
        .emergencyContact(id)
        .then(setContact)
        .catch((cause: Error) => setError(cause.message));
  }
  return (
    <>
      <button className="danger-button" onClick={show}>
        SOS
      </button>
      {open && (
        <Modal
          title="SOS"
          subtitle="Contato de emergência e serviços de atendimento."
          onClose={() => setOpen(false)}
        >
          {error && <ErrorBanner error={error} />}
          <div className="clinical-form">
            <label>
              Cliente
              <PatientPicker
                patients={patients}
                value={patientId}
                onChange={select}
              />
            </label>
            {contact && (
              <p>
                {contact.phone ? (
                  <>
                    <strong>{contact.name || "Contato de emergência"}</strong> ·{" "}
                    <a
                      className="secondary-button"
                      href={`tel:${contact.phone}`}
                    >
                      Ligar para {contact.phone}
                    </a>
                  </>
                ) : (
                  "Contato de emergência não cadastrado."
                )}
              </p>
            )}
            <div className="page-actions">
              <a className="secondary-button" href="tel:190">
                Polícia · 190
              </a>
              <a className="secondary-button" href="tel:192">
                SAMU · 192
              </a>
              <a className="secondary-button" href="tel:193">
                Bombeiros · 193
              </a>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
