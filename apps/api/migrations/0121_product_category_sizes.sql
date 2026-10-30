-- Tamanhos definidos na categoria de produtos (na ordem de exibição): os produtos da categoria
-- escolhem entre eles no lugar da escala fixa de roupas.
ALTER TABLE clinic_catalogs ADD COLUMN sizes text[] NOT NULL DEFAULT '{}';
