-- Horários fixos passam a ter término. Os já cadastrados recebem início + duração do serviço,
-- limitado a 23:59 para não virar o dia.
UPDATE group_classes g
SET weekly_slots = (
    SELECT jsonb_agg(
      CASE WHEN e.slot ? 'endTime' THEN e.slot
        ELSE e.slot || jsonb_build_object('endTime',
          CASE WHEN (e.slot->>'startTime')::time + make_interval(mins => s.duration_minutes) > (e.slot->>'startTime')::time
            THEN to_char((e.slot->>'startTime')::time + make_interval(mins => s.duration_minutes), 'HH24:MI')
            ELSE '23:59'
          END)
      END
      ORDER BY e.position)
    FROM jsonb_array_elements(g.weekly_slots) WITH ORDINALITY AS e(slot, position)
  ),
  updated_at = now()
FROM services s
WHERE s.id = g.service_id
  AND jsonb_array_length(g.weekly_slots) > 0;
