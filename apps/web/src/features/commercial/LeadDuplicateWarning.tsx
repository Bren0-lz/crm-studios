import { describeLeadDuplicate, type LeadDuplicateMatch } from "@crm/contracts";

export function LeadDuplicateWarning({
  matches,
  busy,
  onOpenPatient,
  onSaveAnyway,
}: {
  matches: LeadDuplicateMatch[];
  busy: boolean;
  onOpenPatient: (patientId: string) => void;
  onSaveAnyway: () => void;
}) {
  if (!matches.length) return null;
  return (
    <div className="lead-duplicate-warning span-2" role="alert">
      <ul>
        {matches.map((match) => (
          <li key={`${match.kind}-${match.id}`}>
            <span>{describeLeadDuplicate(match)}</span>
            {match.kind === "patient" && (
              <button
                type="button"
                className="secondary-button"
                aria-label={`Abrir ficha de ${match.fullName}`}
                disabled={busy}
                onClick={() => onOpenPatient(match.id)}
              >
                Abrir ficha
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="secondary-button"
        disabled={busy}
        onClick={onSaveAnyway}
      >
        Salvar mesmo assim
      </button>
    </div>
  );
}
