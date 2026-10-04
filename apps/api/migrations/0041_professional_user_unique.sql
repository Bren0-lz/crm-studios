-- Comissão por usuário (T050): cada usuário liga-se a no máximo um profissional da agenda
-- por clínica (professionals.user_id).
-- Antes do índice, desfaz ligações duplicadas que o banco possa ter (o mesmo usuário em mais de
-- um profissional): mantém só o profissional mais antigo, para a migração não falhar.
UPDATE professionals p
SET user_id = NULL, updated_at = now()
WHERE p.user_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM professionals o
    WHERE o.clinic_id = p.clinic_id
      AND o.user_id = p.user_id
      AND (o.created_at, o.id) < (p.created_at, p.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS professionals_clinic_user_unique
  ON professionals (clinic_id, user_id)
  WHERE user_id IS NOT NULL;
