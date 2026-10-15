import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Phone, Siren, UserRound } from "lucide-react";
import { formatPhone, type PatientOption } from "@crm/contracts";
import { api } from "../../api";
import { useAuthorization } from "../auth/authorization-context";
import { Modal } from "./Modal";
import { ErrorBanner } from "./ErrorBanner";
import { PatientPicker } from "../../PatientPicker";

type ContactState =
  | { status: "idle" | "loading" }
  | { status: "ready"; name: string; phone: string }
  | { status: "error"; error: string };

function EmergencyDialog({ onClose }: { onClose: () => void }) {
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientsError, setPatientsError] = useState("");
  const [patientsAttempt, setPatientsAttempt] = useState(0);
  const [patientId, setPatientId] = useState("");
  const [contact, setContact] = useState<ContactState>({ status: "idle" });
  const [contactAttempt, setContactAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void api.patientOptions().then(
      (items) => {
        if (!current) return;
        setPatients(items);
        setPatientsLoading(false);
      },
      (cause: unknown) => {
        if (!current) return;
        setPatientsError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível buscar clientes.",
        );
        setPatientsLoading(false);
      },
    );
    return () => {
      current = false;
    };
  }, [patientsAttempt]);

  useEffect(() => {
    if (!patientId) return;
    let current = true;
    void api.emergencyContact(patientId).then(
      (result) => {
        if (current) setContact({ status: "ready", ...result });
      },
      (cause: unknown) => {
        if (current)
          setContact({
            status: "error",
            error:
              cause instanceof Error
                ? cause.message
                : "Não foi possível consultar o contato.",
          });
      },
    );
    return () => {
      current = false;
    };
  }, [patientId, contactAttempt]);

  return (
    <Modal
      className="emergency-modal"
      title="SOS"
      eyebrow="Emergência"
      subtitle="Contato de emergência e serviços de atendimento."
      onClose={onClose}
    >
      <div className="emergency-content clinical-form">
        <div className="emergency-search">
          <PatientPicker
            popover
            className="emergency-patient-picker"
            patients={patients}
            loading={patientsLoading}
            value={patientId}
            onChange={(id) => {
              setPatientId(id);
              if (id) setContactAttempt((attempt) => attempt + 1);
              setContact({ status: id ? "loading" : "idle" });
            }}
          />
          {patientsError && (
            <div className="emergency-error">
              <ErrorBanner error={patientsError} />
              <button
                className="secondary-button"
                onClick={() => {
                  setPatientsError("");
                  setPatientsLoading(true);
                  setPatientsAttempt((attempt) => attempt + 1);
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}
        </div>
        <section
          className="emergency-contact-card"
          aria-label="Contato de emergência"
          aria-busy={contact.status === "loading"}
        >
          <h3>
            <UserRound size={18} aria-hidden="true" />
            Contato de emergência
          </h3>
          {contact.status === "idle" && (
            <p>Selecione um cliente para consultar o contato de emergência.</p>
          )}
          {contact.status === "loading" && (
            <p role="status">Consultando contato de emergência…</p>
          )}
          {contact.status === "error" && (
            <div className="emergency-error">
              <ErrorBanner error={contact.error} />
              <button
                className="secondary-button"
                onClick={() => {
                  setContact({ status: "loading" });
                  setContactAttempt((attempt) => attempt + 1);
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}
          {contact.status === "ready" &&
            (contact.phone ? (
              <div className="emergency-contact-details">
                <div>
                  <strong>{contact.name || "Contato de emergência"}</strong>
                  <span>{formatPhone(contact.phone)}</span>
                </div>
                <a className="primary-button" href={`tel:${contact.phone}`}>
                  <Phone size={18} aria-hidden="true" />
                  Ligar para {contact.phone}
                </a>
              </div>
            ) : (
              <p role="status">Contato de emergência não cadastrado.</p>
            ))}
        </section>
        <section
          className="emergency-services"
          aria-label="Serviços de atendimento"
        >
          <h3>Serviços de atendimento</h3>
          <div className="emergency-service-links">
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
        </section>
      </div>
    </Modal>
  );
}

export function EmergencyButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { canView } = useAuthorization();
  const [open, setOpen] = useState(false);
  if (!(["patients", "agenda", "groups", "clinical"] as const).some(canView))
    return null;
  return (
    <>
      <button
        ref={buttonRef}
        className="danger-button emergency-button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Siren size={18} aria-hidden="true" />
        SOS
      </button>
      {open &&
        createPortal(
          <EmergencyDialog
            onClose={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
          />,
          document.body,
        )}
    </>
  );
}
