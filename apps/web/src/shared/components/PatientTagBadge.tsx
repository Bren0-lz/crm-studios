import { tagColorStyle } from "../../tag-colors";

export function PatientTagBadge({
  name,
  color,
}: {
  name: string;
  color: string;
}) {
  return (
    <span className="tag tag-colored" style={tagColorStyle(color)}>
      {name}
    </span>
  );
}
