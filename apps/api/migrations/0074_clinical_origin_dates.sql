ALTER TABLE clinical_resources ADD COLUMN origin_starts_at timestamptz;
UPDATE clinical_resources cr SET origin_starts_at=a.starts_at
FROM appointments a
WHERE cr.kind='evolution' AND cr.clinic_id=a.clinic_id AND cr.data->>'sourceType'='appointment' AND cr.data->>'sourceId'=a.id::text;
UPDATE clinical_resources cr SET origin_starts_at=gs.starts_at
FROM group_attendance ga JOIN group_sessions gs ON gs.clinic_id=ga.clinic_id AND gs.id=ga.session_id
WHERE cr.kind='evolution' AND cr.clinic_id=ga.clinic_id AND cr.data->>'sourceType'='group_attendance' AND cr.data->>'sourceId'=ga.id::text;
