-- Registro de contato do participante do evento (EV3): "contato feito" sim/não.
-- 1 = conversou com a pessoa; 0 = tentativa sem resposta. Registros antigos contam como feitos.
ALTER TABLE `lead_contacts` ADD COLUMN `reached` TINYINT(1) NOT NULL DEFAULT 1;
