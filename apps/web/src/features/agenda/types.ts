import type {
  Appointment,
  GroupSession,
  Patient,
  PatientOption,
  Professional,
  Room,
  ScheduleBlock,
  Service,
} from "@crm/contracts";

export type AgendaEntry =
  | { kind: "block"; startsAt: string; block: ScheduleBlock }
  | { kind: "group"; startsAt: string; session: GroupSession }
  | { kind: "appointment"; startsAt: string; appointment: Appointment };

export type AppointmentModalProps = {
  fixedPatient?: PatientOption | undefined;
  patients: PatientOption[];
  professionals: Professional[];
  rooms: Room[];
  services: Service[];
  onClose: () => void;
  onCreated: (appointments: Appointment[]) => void;
  onPatientCreated: (patient: Patient) => void;
};
