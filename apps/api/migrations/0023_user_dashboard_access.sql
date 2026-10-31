-- Acesso ao painel de vendas (dashboard externo, login pela API externa). Permissão especial:
-- fica fora do catálogo de permissões, então nem o admin a recebe sozinho; começa negada.
ALTER TABLE `users`
  ADD COLUMN `dashboard_access` TINYINT(1) NOT NULL DEFAULT 0;
