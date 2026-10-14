-- A conciliação pode recuperar valores pagos, preservando o sinal do caixa.
-- Eventos antigos de pagamento/estorno continuam sujeitos à regra original.
ALTER TABLE commission_payment_events DROP CONSTRAINT commission_payment_events_check;
ALTER TABLE commission_payment_events ADD CONSTRAINT commission_payment_events_check
  CHECK (account_payment_id IS NOT NULL
    OR (kind='payment' AND amount_in_cents>=0)
    OR (kind='reversal' AND amount_in_cents<=0));

ALTER TABLE commission_account_payments
  ADD CONSTRAINT commission_account_payments_clinic_identity UNIQUE(clinic_id,id);
ALTER TABLE commission_payment_events
  ADD CONSTRAINT commission_payment_events_account_scope
    FOREIGN KEY(clinic_id,account_payment_id) REFERENCES commission_account_payments(clinic_id,id),
  ADD CONSTRAINT commission_payment_events_commission_scope
    FOREIGN KEY(clinic_id,commission_id) REFERENCES commission_entries(clinic_id,id);
