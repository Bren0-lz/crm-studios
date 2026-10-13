import type { Patient, PatientOption } from "@crm/contracts";
import { api } from "../../api";

export async function fetchAgendaPatients(
  canSeePatients: boolean,
): Promise<{ options: PatientOption[]; records: Patient[] }> {
  if (!canSeePatients)
    return { options: await api.patientOptions(), records: [] };
  const records = await api.patients();
  return { options: records, records };
}

export function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}
