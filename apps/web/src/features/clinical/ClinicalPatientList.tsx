import type { PatientOption } from "@crm/contracts";
import { Search, UsersRound } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../../shared/components/EmptyState";
import { initials } from "../../shared/lib/formatting";
import { filterClinicalPatients } from "./model";

/** Coluna de clientes da página Prontuários: busca e seleção. */
export function ClinicalPatientList({
  patients,
  selectedId,
  onSelect,
}: {
  patients: PatientOption[];
  selectedId: string | undefined;
  onSelect: (patientId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = filterClinicalPatients(patients, query);

  return (
    <section className="panel clinical-patient-list" aria-label="Clientes">
      <div className="clinical-patient-list-head">
        <label className="chart-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar cliente"
            placeholder="Buscar cliente"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {visible.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="Nenhum cliente encontrado"
          copy="Confira a busca ou cadastre o cliente em Clientes."
        />
      ) : (
        <ul className="clinical-patient-items">
          {visible.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                className="clinical-patient-item"
                aria-current={patient.id === selectedId ? "true" : undefined}
                onClick={() => onSelect(patient.id)}
              >
                <span className="clinical-patient-avatar" aria-hidden="true">
                  {initials(patient.fullName)}
                </span>
                <span className="clinical-patient-copy">
                  <strong>{patient.fullName}</strong>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
