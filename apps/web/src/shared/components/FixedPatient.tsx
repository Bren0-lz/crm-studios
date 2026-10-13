import type { PatientOption } from "@crm/contracts";

export function FixedPatient({ patient }: { patient: PatientOption }) {
  return (
    <div className="fixed-patient span-2">
      <span>Cliente</span>
      <strong>{patient.fullName}</strong>
    </div>
  );
}
