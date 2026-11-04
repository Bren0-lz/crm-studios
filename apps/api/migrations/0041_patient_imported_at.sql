-- Cliente importado pela planilha (CD3): data da importação. Só os importados recebem as
-- etiquetas automáticas "Cadastro incompleto" e "Sem e-mail". Clientes importados antes desta
-- migração ficam sem a marca (não há registro da origem).
ALTER TABLE `patients`
  ADD COLUMN `imported_at` DATETIME(6) NULL;
