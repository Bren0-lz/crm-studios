import {
  leadAppointmentDay,
  leadConversionDay,
  trialConversionDay,
} from "./mysql-fixtures.js";

leadAppointmentDay.setUTCHours(12, 0, 0, 0);

leadConversionDay.setUTCHours(12, 0, 0, 0);

trialConversionDay.setUTCHours(12, 0, 0, 0);
