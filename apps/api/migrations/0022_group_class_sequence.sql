ALTER TABLE group_classes
  ADD COLUMN sequence integer;

WITH ranked AS (
  SELECT id,
    row_number() OVER (PARTITION BY clinic_id, service_id ORDER BY created_at, id) AS sequence
  FROM group_classes
)
UPDATE group_classes g
SET sequence = ranked.sequence
FROM ranked
WHERE g.id = ranked.id;

ALTER TABLE group_classes
  ALTER COLUMN sequence SET NOT NULL,
  DROP CONSTRAINT group_classes_clinic_id_name_key,
  ADD CONSTRAINT group_classes_service_sequence_key UNIQUE (clinic_id, service_id, sequence);

UPDATE group_classes g
SET name = s.name || ' · Turma ' ||
  CASE WHEN g.sequence <= 26 THEN chr(64 + g.sequence)
    ELSE chr(64 + (g.sequence - 1) / 26) || chr(65 + (g.sequence - 1) % 26)
  END,
  updated_at = now()
FROM services s
WHERE s.id = g.service_id;
