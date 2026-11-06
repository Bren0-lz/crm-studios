-- Linha do serviço no painel de vendas (dashboard-studios): Estúdio ou Estética. As turmas e
-- vendas herdam a linha do serviço na API externa.
ALTER TABLE `services`
  ADD COLUMN `business_line` VARCHAR(20) NOT NULL DEFAULT 'studio',
  ADD CONSTRAINT services_business_line_check CHECK ((business_line IN ('studio', 'aesthetics')));
