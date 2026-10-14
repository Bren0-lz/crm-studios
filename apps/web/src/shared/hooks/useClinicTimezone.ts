import { useEffect, useState } from "react";
import { api } from "../../api";
export function useClinicTimezone() {
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  useEffect(() => {
    let active = true;
    api
      .clinicBranding()
      .then((branding) => {
        if (active && branding?.timezone) setTimezone(branding.timezone);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return timezone;
}
