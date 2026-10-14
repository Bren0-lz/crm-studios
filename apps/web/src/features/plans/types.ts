import type { PatientOption, PatientPlan, Service } from "@crm/contracts";

export type PlanModalProps = {
  patients: PatientOption[];
  fixedPatient?: PatientOption | undefined;
  services: Service[];
  renewing?: PatientPlan;
  onClose: () => void;
  onSaved: (plan: PatientPlan) => void;
};
