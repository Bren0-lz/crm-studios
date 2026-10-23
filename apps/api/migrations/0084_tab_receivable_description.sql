-- Cobrança da comanda (QM15): a descrição deixa de mostrar o trecho do id da comanda
-- ("Comanda E2CD5FDF") e passa a "Comanda de 19/10 · Marina" (abertura no dia local da
-- clínica + primeiro nome do cliente). Valores e vínculos não mudam.
UPDATE receivables r
SET description = 'Comanda de ' || to_char(t.opened_at AT TIME ZONE c.timezone, 'DD/MM')
  || ' · ' || split_part(btrim(p.full_name), ' ', 1)
FROM patient_tabs t
JOIN patients p ON p.id = t.patient_id AND p.clinic_id = t.clinic_id
JOIN clinics c ON c.id = t.clinic_id
WHERE t.receivable_id = r.id
  AND t.clinic_id = r.clinic_id
  AND r.description = 'Comanda ' || upper(left(t.id::text, 8));
