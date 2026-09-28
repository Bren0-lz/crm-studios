-- O serviço demo passa a se chamar só "Dançaterapia" (sem "em grupo"), e o nome das turmas
-- segue o formato "<Serviço> Turma <X>", sem o separador "·".
UPDATE services
SET name = 'Dançaterapia', updated_at = now()
WHERE id = 'e0000001-0000-4000-8000-000000000001' AND name = 'Dançaterapia em grupo';

UPDATE group_classes g
SET name = s.name || ' Turma ' ||
  CASE WHEN g.sequence <= 26 THEN chr(64 + g.sequence)
    ELSE chr(64 + (g.sequence - 1) / 26) || chr(65 + (g.sequence - 1) % 26)
  END,
  updated_at = now()
FROM services s
WHERE s.id = g.service_id;
