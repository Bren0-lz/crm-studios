import type { Patient } from "@crm/contracts";
import { usePatientTags } from "../../shared/hooks/usePatientTags";
import { PatientModal } from "../patients/index";

export function AppointmentPatientCreateModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (patient: Patient) => void;
}) {
  const configuredTags = usePatientTags();
  return (
    <PatientModal
      patient={undefined}
      configuredTags={configuredTags}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
