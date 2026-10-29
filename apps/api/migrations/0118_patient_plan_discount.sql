-- Desconto combinado na venda do plano (tipo, valor, alcance e cobranças já usadas).
-- Vale nas cobranças do plano e segue para as renovações; antes ficava no cliente.
ALTER TABLE patient_plans ADD COLUMN discount jsonb;
