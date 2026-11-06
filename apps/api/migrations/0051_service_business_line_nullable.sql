-- Linha do serviço no painel de vendas passa a ser opcional: NULL = sem classificação, que o
-- painel mostra como "Outros". Decisão do dono (06/11/2026): os serviços existentes voltam para
-- sem classificação e o estúdio classifica um a um em Configurações › Serviços e salas.
-- O CHECK `services_business_line_check` da 0050 continua aceitando só 'studio'/'aesthetics'
-- (NULL passa no CHECK).
ALTER TABLE `services`
  MODIFY COLUMN `business_line` VARCHAR(20) NULL DEFAULT NULL;

UPDATE `services` SET `business_line` = NULL;
