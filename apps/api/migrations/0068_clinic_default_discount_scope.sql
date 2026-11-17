-- Alcance pré-selecionado no desconto novo do plano (RF11, decisão D3): `once` (só no
-- próximo pagamento), `next` (nas próximas cobranças) ou `permanent`. Vazio (NULL) = padrão
-- dos contratos (`defaultPatientDiscountScope`, "once").
ALTER TABLE `clinics`
  ADD COLUMN `default_discount_scope` VARCHAR(16) NULL,
  ADD CONSTRAINT `clinics_default_discount_scope_check` CHECK (`default_discount_scope` IS NULL OR `default_discount_scope` IN ('once', 'next', 'permanent'));
