import type { PatientOption, PatientPlan, Service } from "@crm/contracts";

export type PlanModalProps = {
  patients: PatientOption[];
  services: Service[];
  renewing?: PatientPlan;
  onClose: () => void;
  onSaved: (plan: PatientPlan) => void;
};
