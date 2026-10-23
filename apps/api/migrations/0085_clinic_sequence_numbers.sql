-- Numeração sequencial por clínica (QM15): prontuário "PAC-00012" e recibo "REC-00003",
-- no lugar de trechos de UUID. O contador é travado na transação de quem numera.
CREATE TABLE clinic_sequences (
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL CHECK (name IN ('patient_record', 'receipt')),
  last_value integer NOT NULL CHECK (last_value >= 0),
  PRIMARY KEY (clinic_id, name)
);

-- Recibo: número gravado na primeira emissão; reemitir devolve o mesmo. Cobranças antigas
-- não recebem número retroativo: ganham o próximo quando o recibo for emitido.
ALTER TABLE receivables ADD COLUMN receipt_number integer CHECK (receipt_number > 0);
CREATE UNIQUE INDEX receivables_receipt_number_idx
  ON receivables (clinic_id, receipt_number) WHERE receipt_number IS NOT NULL;

-- Prontuários "PAC-" + 8 primeiros caracteres do id viram a sequência da clínica, depois do
-- maior PAC-NNNNN já usado, em ordem de cadastro. Os que já são sequenciais ficam.
WITH legacy AS (
  SELECT id, clinic_id,
         row_number() OVER (PARTITION BY clinic_id ORDER BY created_at, id) AS position
  FROM patients
  WHERE record_number = 'PAC-' || upper(left(id::text, 8))
), base AS (
  SELECT clinic_id, max(substring(record_number FROM 5)::integer) AS top
  FROM patients
  WHERE record_number ~ '^PAC-[0-9]{5,}$'
    AND record_number <> 'PAC-' || upper(left(id::text, 8))
  GROUP BY clinic_id
), renumbered AS (
  SELECT legacy.id, coalesce(base.top, 0) + legacy.position AS value
  FROM legacy LEFT JOIN base ON base.clinic_id = legacy.clinic_id
)
UPDATE patients p
SET record_number = 'PAC-' || lpad(renumbered.value::text, greatest(5, length(renumbered.value::text)), '0')
FROM renumbered
WHERE p.id = renumbered.id;

INSERT INTO clinic_sequences (clinic_id, name, last_value)
SELECT clinic_id, 'patient_record', max(substring(record_number FROM 5)::integer)
FROM patients
WHERE record_number ~ '^PAC-[0-9]{5,}$'
GROUP BY clinic_id;
