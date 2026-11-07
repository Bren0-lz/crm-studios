-- Linha do produto no painel de vendas (dashboard-studios), como a do serviço (0050/0051):
-- Studio ou Estética, e NULL = sem classificação, que o painel mostra como "Outros". Só
-- categoriza o painel. Decisão do dono (06/11/2026): os produtos existentes ficam sem
-- classificação e o estúdio classifica no cadastro do produto.
ALTER TABLE `products`
  ADD COLUMN `business_line` VARCHAR(20) NULL DEFAULT NULL,
  ADD CONSTRAINT products_business_line_check CHECK ((business_line IN ('studio', 'aesthetics')));
