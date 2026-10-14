import { useLocation } from "react-router-dom";
export function usePatientContext() {
  const { search } = useLocation();
  const id = new URLSearchParams(search).get("patientId") ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  )
    ? id
    : "";
}
