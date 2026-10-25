-- Forma de pagamento combinada na venda do plano e chave Pix da clínica para a cobrança.
ALTER TABLE patient_plans ADD COLUMN payment_method text
  CHECK (payment_method IN ('pix', 'card', 'cash', 'bank_transfer', 'boleto', 'other'));
ALTER TABLE clinics ADD COLUMN pix_key text;
