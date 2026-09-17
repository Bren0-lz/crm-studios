ALTER TABLE group_classes
  ADD COLUMN weekly_slots jsonb NOT NULL DEFAULT '[]'::jsonb;

WITH distinct_slots AS (
  SELECT DISTINCT gs.group_id,
    EXTRACT(DOW FROM gs.starts_at AT TIME ZONE c.timezone)::integer AS weekday,
    to_char(gs.starts_at AT TIME ZONE c.timezone, 'HH24:MI') AS start_time
  FROM group_sessions gs
  JOIN clinics c ON c.id = gs.clinic_id
  WHERE gs.status <> 'cancelled'
), ranked_slots AS (
  SELECT group_id, weekday, start_time,
    row_number() OVER (PARTITION BY group_id ORDER BY weekday, start_time) AS position
  FROM distinct_slots
), inferred AS (
  SELECT group_id,
    jsonb_agg(jsonb_build_object('weekday', weekday, 'startTime', start_time) ORDER BY weekday, start_time) AS slots
  FROM ranked_slots
  WHERE position <= 14
  GROUP BY group_id
)
UPDATE group_classes g
SET weekly_slots = inferred.slots
FROM inferred
WHERE g.id = inferred.group_id;
