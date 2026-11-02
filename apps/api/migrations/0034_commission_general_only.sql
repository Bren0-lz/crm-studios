-- Só existe a comissão geral (percentual sobre o valor pago pelo cliente). As regras por
-- serviço e as de valor fixo por presença deixam de valer: ficam desativadas, e os lançamentos
-- já gerados com elas são mantidos (histórico).
UPDATE `commission_rules` SET `active` = 0 WHERE `service_id` IS NOT NULL OR `kind` = 'fixed';
