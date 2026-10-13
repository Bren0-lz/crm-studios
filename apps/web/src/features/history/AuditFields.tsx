import type { AuditField } from "../../audit-history";

export function AuditFields({ fields }: { fields: AuditField[] }) {
  return (
    <dl className="audit-fields">
      {fields.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
