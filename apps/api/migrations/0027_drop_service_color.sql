-- A cor do serviço não era usada em nenhuma tela: a agenda usa a cor do profissional.
ALTER TABLE `services` DROP COLUMN `color`;
