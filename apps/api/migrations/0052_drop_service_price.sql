-- Serviço é só cadastro (nome, duração, linha, profissionais e salas): o valor fica nos planos,
-- e o atendimento único é um plano avulso de 1 sessão. Os planos avulsos já criados ficam.
ALTER TABLE `services` DROP CONSTRAINT `services_price_in_cents_check`;
ALTER TABLE `services` DROP COLUMN `price_in_cents`;
