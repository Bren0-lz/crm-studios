import { administrationApi } from "./shared/api/domains/administration";
import { agendaApi } from "./shared/api/domains/agenda";
import { clinicalApi } from "./shared/api/domains/clinical";
import { commercialApi } from "./shared/api/domains/commercial";
import { communicationsApi } from "./shared/api/domains/communications";
import { contractsApi } from "./shared/api/domains/contracts";
import { financeApi } from "./shared/api/domains/finance";
import { patientsApi } from "./shared/api/domains/patients";
import { plansApi } from "./shared/api/domains/plans";
import { relationshipApi } from "./shared/api/domains/relationship";
import { reportsApi } from "./shared/api/domains/reports";

export const api = {
  ...administrationApi,
  ...financeApi,
  ...reportsApi,
  ...patientsApi,
  ...agendaApi,
  ...clinicalApi,
  ...plansApi,
  ...commercialApi,
  ...communicationsApi,
  ...relationshipApi,
  ...contractsApi,
};
export { ApiClientError } from "./shared/api/ApiClientError";
export { login } from "./shared/api/login";
export type { PatientExportParams } from "./shared/api/patient-export";
export {
  clearSession,
  getStoredUser,
  hasSession,
  storeUser,
} from "./shared/api/session";
export type { Session } from "./shared/api/session";
