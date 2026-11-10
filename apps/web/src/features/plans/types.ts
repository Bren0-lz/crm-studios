import type { PatientOption, PatientPlan, Service } from "@crm/contracts";

export type PlanModalProps = {
  patients: PatientOption[];
  fixedPatient?: PatientOption | undefined;
  services: Service[];
  renewing?: PatientPlan;
  onClose: () => void;
  onSaved: (plan: PatientPlan) => void;
  /** Turma cheia (TW3): o cliente foi para a Lista de espera, sem plano; `message` é o aviso. */
  onWaitlisted?: (message: string) => void;
};
