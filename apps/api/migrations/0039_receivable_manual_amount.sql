-- Cobrança de plano recorrente com o valor informado à mão na venda (1º pagamento com o
-- cálculo proporcional desligado). Exibida como "valor manual" no Financeiro e nos relatórios.
ALTER TABLE `receivables`
  ADD COLUMN `manual_amount` TINYINT(1) NOT NULL DEFAULT 0;
